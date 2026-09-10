import { createHash } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';
import type { CompletedObject, PresignDownloadResult, PresignUploadResult, StorageAdapter } from './storage';

/**
 * Cloudflare R2, S3-compatible. Per the plan's residency note: R2 has no
 * India jurisdiction, only APAC location hints — this was chosen anyway
 * for zero egress on a product whose core actions are downloads and ZIP
 * exports. The fallback to S3 ap-south-1 stays a config change (swap
 * R2_ENDPOINT/keys for AWS's) as long as no R2-specific API is used here.
 *
 * Two things that differ from plain S3 and will otherwise cost debugging
 * time: bucket CORS must be configured on the R2 bucket itself before
 * browser PUT uploads succeed (not done by this code), and R2 has no S3
 * event notifications — nothing fires when an object lands, so whatever
 * needs to run after upload (the malware scan enqueue) must happen at the
 * call site's `complete()` call, not via a bucket trigger.
 */
function client(): S3Client {
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('STORAGE_DRIVER=r2 requires R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
  }
  return new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function bucket(): string {
  if (!env.R2_BUCKET) throw new Error('STORAGE_DRIVER=r2 requires R2_BUCKET.');
  return env.R2_BUCKET;
}

export function r2StorageAdapter(): StorageAdapter {
  return {
    async presignUpload({ key, contentType, expiresInSeconds = 900 }) {
      const s3 = client();
      const command = new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType });
      const url = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
      const result: PresignUploadResult = {
        url,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        key,
      };
      return result;
    },

    async presignDownload({ key, expiresInSeconds = 300 }) {
      const s3 = client();
      const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
      const url = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
      const result: PresignDownloadResult = {
        url,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      };
      return result;
    },

    async complete(key): Promise<CompletedObject> {
      const s3 = client();
      // No bucket event to rely on (see file header) — this is the only
      // point that confirms the object landed before anything downstream
      // (Stage 8's scan enqueue) treats the submission as real.
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));

      // R2 has zero egress cost, but this still reads the whole object
      // back through the app to hash it (Stage 6) — the server never
      // sees the bytes on a direct-to-R2 PUT, and file_asset.sha256Hash
      // is NOT NULL. Stage 8's scan job has to fetch these same bytes
      // anyway, so this read-back is expected to merge into that single
      // pass once scanning moves off the request path.
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      if (!object.Body) throw new Error(`Object body missing for ${key}.`);
      const hash = createHash('sha256');
      for await (const chunk of object.Body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
      }

      return {
        byteSize: head.ContentLength ?? 0,
        contentType: head.ContentType ?? null,
        sha256: hash.digest('hex'),
      };
    },

    async delete(key) {
      const s3 = client();
      await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    },
  };
}
