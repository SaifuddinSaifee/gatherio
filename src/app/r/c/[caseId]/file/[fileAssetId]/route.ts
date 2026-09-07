import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { assertTokenStillValid } from '@/db/party-session';
import { recipientCookieName, verifyRecipientCookie } from '@/lib/recipient-cookie';
import { clientIp, userAgent } from '@/lib/request-context';
import { FileNotFoundError, FileNotScannedError, presignFileDownload } from '@/lib/domain/file';

/**
 * The recipient's own download link for a completed-item file. Linked
 * from completed-item.tsx with a plain <a>, never Next's <Link> — a
 * <Link> would prefetch on hover/viewport-entry, minting a real
 * presigned URL (and its file.downloaded audit write) before the
 * recipient ever actually clicked. A mail scanner can't reach this route
 * at all: it has no cookie, and this route never appears in the initial
 * page's markup as anything but a same-origin path a script never
 * fetches on its own.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string; fileAssetId: string }> },
) {
  const { caseId, fileAssetId } = await params;

  const cookieStore = await cookies();
  const raw = cookieStore.get(recipientCookieName(caseId))?.value;
  if (!raw) return NextResponse.redirect(new URL('/r/expired?reason=not_found', req.url));

  const verified = verifyRecipientCookie(raw);
  if (!verified.ok || verified.payload.caseId !== caseId) {
    return NextResponse.redirect(new URL('/r/expired?reason=not_found', req.url));
  }

  const stillValid = await assertTokenStillValid(verified.payload.accessTokenId);
  if (!stillValid.ok) {
    return NextResponse.redirect(new URL(`/r/expired?reason=${stillValid.reason}`, req.url));
  }

  const h = await headers();

  try {
    const { url } = await presignFileDownload(verified.payload.workspaceId, fileAssetId, {
      actorType: 'party',
      actorId: verified.payload.partyId,
      expectedCaseId: caseId,
      ipAddress: clientIp(h),
      userAgent: userAgent(h),
    });
    return NextResponse.redirect(url, 302);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }
    if (err instanceof FileNotScannedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not generate a download link.' }, { status: 500 });
  }
}
