import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Generic stateless HMAC-signed token: base64url(JSON payload) +
 * "." + base64url(HMAC-SHA256(payload, secret)). Same shape as the
 * private `sign`/`verifyLocalStorageToken` pair in
 * src/lib/adapters/storage.local.ts, extracted here because Stage 6
 * needs two more instances of exactly the same pattern (the recipient
 * session cookie and the upload ticket) — one signing idiom in the
 * codebase, not three copies of it.
 */

export function signHmacToken<T>(payload: T, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export type VerifyHmacTokenResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: 'malformed' | 'bad_signature' };

export function verifyHmacToken<T>(token: string, secret: string): VerifyHmacTokenResult<T> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return { ok: false, reason: 'malformed' };

  const expectedSig = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}
