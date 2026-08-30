import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { verifyLocalStorageToken, writeLocalFile } from '@/lib/adapters/storage.local';

/**
 * Counterpart to storage.local.ts's presignUpload: validates the signed
 * token (key + expiry, not the raw body) and streams the request body to
 * disk. Only reachable in STORAGE_DRIVER=local; R2 uploads go straight
 * from the browser to Cloudflare and never hit this app.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let payload: ReturnType<typeof verifyLocalStorageToken>;
  try {
    payload = verifyLocalStorageToken(token);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }

  if (payload.action !== 'upload') {
    return NextResponse.json({ error: 'Token is not an upload token.' }, { status: 403 });
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (payload.maxBytes && contentLength > payload.maxBytes) {
    return NextResponse.json({ error: 'File exceeds allowed size.' }, { status: 413 });
  }

  if (!req.body) {
    return NextResponse.json({ error: 'Empty request body.' }, { status: 400 });
  }

  await writeLocalFile(payload.key, Readable.fromWeb(req.body as never));

  return NextResponse.json({ key: payload.key });
}
