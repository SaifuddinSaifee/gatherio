import { env } from '@/lib/env';
import { signHmacToken, verifyHmacToken } from '@/lib/hmac-token';
import type { WorkspaceId } from '@/db/scoped';

/**
 * The recipient's session cookie (Stage 6). Stateless — everything a
 * request needs is in the signed payload — but it carries the
 * `access_token.id` specifically so revocation is enforceable: every
 * action re-reads that DB row via assertTokenStillValid() rather than
 * trusting the cookie forever. Named per-case (`gather_r_<caseId>`), not
 * with one fixed name, so two live case links open in the same browser
 * don't clobber each other's session.
 */

export interface RecipientCookiePayload {
  accessTokenId: string;
  workspaceId: WorkspaceId;
  caseId: string;
  partyId: string;
  exp: number;
}

export function recipientCookieName(caseId: string): string {
  return `gather_r_${caseId}`;
}

export interface SignedRecipientCookie {
  value: string;
  maxAgeSeconds: number;
}

export function signRecipientCookie(
  payload: Omit<RecipientCookiePayload, 'exp'>,
): SignedRecipientCookie {
  const maxAgeSeconds = env.RECIPIENT_SESSION_TTL_SECONDS;
  const exp = Date.now() + maxAgeSeconds * 1000;
  const value = signHmacToken<RecipientCookiePayload>({ ...payload, exp }, env.AUTH_SECRET);
  return { value, maxAgeSeconds };
}

/** Attributes for the Set-Cookie call — shared here so every write site (issue, resend, reissue) agrees. */
export function recipientCookieAttributes(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/r',
    secure: env.APP_URL.startsWith('https://'),
    maxAge: maxAgeSeconds,
  };
}

export type VerifyRecipientCookieResult =
  | { ok: true; payload: RecipientCookiePayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyRecipientCookie(value: string): VerifyRecipientCookieResult {
  const result = verifyHmacToken<RecipientCookiePayload>(value, env.AUTH_SECRET);
  if (!result.ok) return result;
  if (Date.now() > result.payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload: result.payload };
}
