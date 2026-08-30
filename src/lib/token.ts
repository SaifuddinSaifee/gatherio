import { randomBytes, createHash } from 'node:crypto';

/**
 * §4.7 / techstack.md: store the hash, never the token. A leaked DB row
 * must not be a usable link. 32 bytes of entropy, base64url so it's safe
 * to drop straight into a URL path segment.
 */
export function generateAccessToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashAccessToken(token) };
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
