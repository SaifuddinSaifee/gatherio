import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { localFilePath, verifyLocalStorageToken } from '@/lib/adapters/storage.local';

/**
 * Counterpart to storage.local.ts's presignDownload. Every real download
 * (not just this dev shim) is meant to be logged as an audit event —
 * that happens at the call site that generated the presigned URL
 * (Stage 9's export flow), not here, since this route only ever sees an
 * opaque already-authorized token.
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
