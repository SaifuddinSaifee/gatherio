import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { localFilePath, verifyLocalStorageToken } from '@/lib/adapters/storage.local';

/**
 * Counterpart to storage.local.ts's presignDownload. Every real download
 * is logged as an audit event and gated on file_asset.malwareScanStatus
 * === 'clean' — that happens in src/lib/domain/file.ts's
 * presignFileDownload, at the call site that mints the presigned URL,
 * deliberately NOT here.
 *
 * This route only ever sees an opaque, stateless HMAC token — it has no
 * way to look up which file_asset (if any) the key belongs to, so it
 * cannot check scan status even if it wanted to. More importantly, under
 * STORAGE_DRIVER=r2 this route isn't even in the request path — the
 * browser is handed a Cloudflare-signed URL and downloads straight from
 * R2, never touching Next at all. A scan gate here would only ever work
 * in local dev and would be actively misleading in production. Do not
 * add one; add it to presignFileDownload instead.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let payload: ReturnType<typeof verifyLocalStorageToken>;
  try {
    payload = verifyLocalStorageToken(token);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }

  if (payload.action !== 'download') {
    return NextResponse.json({ error: 'Token is not a download token.' }, { status: 403 });
  }

  const filePath = localFilePath(payload.key);
  const info = await stat(filePath).catch(() => null);
  if (!info) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      'Content-Length': String(info.size),
      'Content-Disposition': 'attachment',
    },
  });
}
