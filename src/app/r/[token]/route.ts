import { NextRequest, NextResponse } from 'next/server';
import { resolveRecipientSession } from '@/db/party-session';
import {
  recipientCookieAttributes,
  recipientCookieName,
  signRecipientCookie,
} from '@/lib/recipient-cookie';
import { env } from '@/lib/env';

/**
 * The entire job of a GET against a recipient magic link (§4.7,
 * techstack.md): resolve the token, mint a session cookie, and redirect.
 * It writes NOTHING — no assignment update, no audit event — because a
 * corporate mail scanner pre-fetches this exact URL on every email it
 * delivers, and that pre-fetch must never be mistaken for the recipient
 * actually opening their case. `case.viewed` is written later by a
 * client-side beacon on /r/c/[caseId], which a scanner never executes —
 * it fetches HTML, it doesn't run JS.
 *
 * `route.ts` (not `page.tsx`) is required here for a second reason
 * beyond the write-nothing rule: a Server Component cannot set a cookie
 * in Next.js 15, only a Server Action or a Route Handler can.
 *
 * Redirecting to /r/c/[caseId] rather than rendering the recipient page
 * directly at this URL also means the raw token stops appearing in the
 * address bar, browser history, or any outbound Referer header after
 * this one hop — the same problem the requester-side `?newToken=` query
 * parameter had, fixed on both ends of the link.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const result = await resolveRecipientSession(token);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/r/expired?reason=${result.reason}`, env.APP_URL), 303);
  }

  const { session } = result;
  const { value, maxAgeSeconds } = signRecipientCookie({
    accessTokenId: session.accessTokenId,
    workspaceId: session.workspaceId,
    caseId: session.caseId,
    partyId: session.partyId,
  });

  const response = NextResponse.redirect(new URL(`/r/c/${session.caseId}`, env.APP_URL), 303);
  response.cookies.set(
    recipientCookieName(session.caseId),
    value,
    recipientCookieAttributes(maxAgeSeconds),
  );
  return response;
}
