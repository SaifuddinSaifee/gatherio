import { env } from '@/lib/env';
import { signHmacToken, verifyHmacToken } from '@/lib/hmac-token';

/**
 * A short-lived, signed cookie carrying the just-minted recipient link so
 * the case page can show it once without putting the token in the URL
 * (history, `Referer`, access logs). Set by createCaseAction /
 * resendInviteAction / revokeAndReissueAction; read by the case detail
 * Server Component, which cannot itself clear it — a Server Component
 * can only read cookies, not set headers on the response — so it lives
 * its full TTL. Strictly better than a URL that lives in history
 * forever, and short enough that reloading the page a minute later stops
 * showing it.
 */

export const CASE_LINK_FLASH_COOKIE_NAME = 'gather_case_link';
export const CASE_LINK_FLASH_TTL_SECONDS = 300;

export interface CaseLinkFlashPayload {
  caseId: string;
  link: string;
  expiresAt: string;
  exp: number;
}

export function signCaseLinkFlash(payload: Omit<CaseLinkFlashPayload, 'exp'>): string {
  const exp = Date.now() + CASE_LINK_FLASH_TTL_SECONDS * 1000;
  return signHmacToken<CaseLinkFlashPayload>({ ...payload, exp }, env.AUTH_SECRET);
}

export function caseLinkFlashCookieAttributes() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/cases',
    secure: env.APP_URL.startsWith('https://'),
    maxAge: CASE_LINK_FLASH_TTL_SECONDS,
  };
}

/** Returns the payload only if it verifies, hasn't expired, and matches the case being viewed. */
export function readCaseLinkFlash(value: string, caseId: string): CaseLinkFlashPayload | null {
  const result = verifyHmacToken<CaseLinkFlashPayload>(value, env.AUTH_SECRET);
  if (!result.ok) return null;
  if (Date.now() > result.payload.exp) return null;
  if (result.payload.caseId !== caseId) return null;
  return result.payload;
}
