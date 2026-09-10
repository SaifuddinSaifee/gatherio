import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import type { CompletedObject, PresignDownloadResult, PresignUploadResult, StorageAdapter } from './storage';

/**
 * Filesystem-backed storage so the whole app runs with zero cloud
 * accounts. Presigning is a signed, expiring token instead of a real
 * presigned URL — the /api/upload/[token] and /api/download/[token]
 * routes verify it and stream to/from STORAGE_LOCAL_DIR. Same shape of
 * guarantee as a real presigned URL (time-boxed, tamper-evident, scoped
 * to one key), just without a cloud provider behind it.
 */

interface TokenPayload {
  key: string;
  action: 'upload' | 'download';
  maxBytes?: number;
  contentType?: string;
  exp: number;
}

function sign(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', env.AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyLocalStorageToken(token: string): TokenPayload {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new Error('Malformed storage token.');

  const expectedSig = createHmac('sha256', env.AUTH_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid storage token signature.');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  if (Date.now() > payload.exp) throw new Error('Storage token expired.');
  return payload;
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function absolutePath(key: string): string {
  const root = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('Storage key escapes the storage root.');
  }
  return resolved;
}

export function localStorageAdapter(): StorageAdapter {
  return {
    async presignUpload({ key, contentType, maxBytes, expiresInSeconds = 900 }) {
      const token = sign({
        key,
        action: 'upload',
        maxBytes,
        contentType,
        exp: Date.now() + expiresInSeconds * 1000,
      });
      const result: PresignUploadResult = {
        url: `${env.APP_URL}/api/upload/${token}`,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        key,
      };
      return result;
    },

    async presignDownload({ key, expiresInSeconds = 300 }) {
      const exp = Date.now() + expiresInSeconds * 1000;
      const token = sign({ key, action: 'download', exp });
      const result: PresignDownloadResult = {
        url: `${env.APP_URL}/api/download/${token}`,
        expiresAt: new Date(exp),
      };
      return result;
    },

    async complete(key): Promise<CompletedObject> {
      const filePath = absolutePath(key);
      const info = await stat(filePath).catch(() => null);
      if (!info) throw new Error(`Upload did not complete: ${key} not found.`);
      const sha256 = await hashFile(filePath);
      // The local driver stores no separate metadata sidecar — it has no
      // content-type to report back, unlike R2's HeadObject.
      return { byteSize: info.size, contentType: null, sha256 };
    },

    async delete(key) {
      await rm(absolutePath(key), { force: true });
    },
  };
}

/** Used by the /api/upload/[token] route handler. */
export async function writeLocalFile(key: string, data: AsyncIterable<Uint8Array>): Promise<void> {
  const filePath = absolutePath(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'w');
  try {
    for await (const chunk of data) {
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
}

export function localFilePath(key: string): string {
  return absolutePath(key);
}
