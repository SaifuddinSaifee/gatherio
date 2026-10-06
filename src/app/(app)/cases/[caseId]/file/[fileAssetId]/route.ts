import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getCurrentSession } from '@/db/session';
import { clientIp, userAgent } from '@/lib/request-context';
import { FileNotFoundError, FileNotScannedError, presignFileDownload } from '@/lib/domain/file';

/**
 * The requester's own download link for a submitted file — Stage 7's
 * reviewer download, and ACL chokepoint 1 for Stage 11's case ACL
 * (`can()` isn't built yet; this is the call site it will gate). Linked
 * from the case page with a plain <a>, never Next's <Link>, for the same
 * reason as the recipient's equivalent route: a <Link> prefetches on
 * hover/viewport-entry, which would mint a real presigned URL — and its
 * audited `file.downloaded` event — before anyone actually clicked.
 *
 * Unlike the recipient route, `expectedCaseId` still matters even though
 * a requester isn't limited to one case the way a recipient token is:
 * without it, a requester could swap the fileAssetId in the URL to read
 * a file from a different case in the same workspace via a route whose
 * URL implies the case it belongs to.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string; fileAssetId: string }> },
) {
  const { caseId, fileAssetId } = await params;

  const session = await getCurrentSession();
  if (!session) return NextResponse.redirect(new URL('/sign-in', req.url));

  const h = await headers();

  try {
    const { url } = await presignFileDownload(session.workspaceId, fileAssetId, {
      actorType: 'user',
      actorId: session.userId,
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
