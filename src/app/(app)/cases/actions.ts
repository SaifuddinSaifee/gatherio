'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentSession, type CurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import type { WorkspaceId } from '@/db/scoped';
import { instantiateCase, issueCaseAccess, recordInviteSent, type IssueAccessMode } from '@/lib/domain/case';
import { approveSubmission, requestChanges } from '@/lib/domain/review';
import { sendCaseInvite } from '@/lib/domain/invite';
import { env } from '@/lib/env';
import { clientIp, userAgent } from '@/lib/request-context';
import {
  CASE_LINK_FLASH_COOKIE_NAME,
  caseLinkFlashCookieAttributes,
  signCaseLinkFlash,
} from '@/lib/case-link-flash';

/**
 * Emails the recipient their link and stashes it in a short-lived signed
 * cookie so the case page can show it once — outside the transaction
 * that minted the token (never hold a transaction open across network
 * IO) and non-fatal on failure (the case/token already exist either
 * way; a bounced email doesn't need to be a bounced case).
 */
async function sendInviteAndStashLink(
  workspaceId: WorkspaceId,
  userId: string,
  caseId: string,
  recipientEmail: string,
  partyName: string,
  caseName: string,
  link: string,
  expiresAt: Date,
): Promise<void> {
  const workspace = await getWorkspaceById(workspaceId);
  const result = await sendCaseInvite({
    to: recipientEmail,
    partyName,
    caseName,
    workspaceName: workspace?.name ?? 'Your workspace',
    link,
    expiresAt,
  });
  await recordInviteSent(workspaceId, caseId, userId, {
    recipient: recipientEmail,
    providerMessageId: result.providerMessageId,
  });

  const cookieStore = await cookies();
  cookieStore.set(
    CASE_LINK_FLASH_COOKIE_NAME,
    signCaseLinkFlash({ caseId, link, expiresAt: expiresAt.toISOString() }),
    caseLinkFlashCookieAttributes(),
  );
}

export async function createCaseAction(formData: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');

  const templateId = String(formData.get('templateId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const dueAtRaw = String(formData.get('dueAt') ?? '');
  const partyType = String(formData.get('partyType') ?? 'individual') as 'individual' | 'organization';
  const displayName = String(formData.get('displayName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;
  const organizationName = String(formData.get('organizationName') ?? '').trim() || null;

  if (!templateId || !name || !displayName) {
    redirect('/cases/new?error=Template,+case+name,+and+recipient+name+are+required');
  }

  let caseId: string;
  let token: string;
  let expiresAt: Date;
  try {
    const result = await instantiateCase(session.workspaceId, session.userId, {
      templateId,
      name,
      dueAt: dueAtRaw ? new Date(dueAtRaw) : null,
      party: { partyType, displayName, email, phone, organizationName },
    });
    caseId = result.case.id;
    token = result.token;
    expiresAt = result.expiresAt;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create case.';
    redirect(`/cases/new?error=${encodeURIComponent(message)}`);
  }

  const link = `${env.APP_URL}/r/${token}`;
  if (email) {
    await sendInviteAndStashLink(
      session.workspaceId,
      session.userId,
      caseId,
      email,
      displayName,
      name,
      link,
      expiresAt,
    );
  }

  redirect(`/cases/${caseId}`);
}

async function reissueAndRedirect(caseId: string, mode: IssueAccessMode): Promise<void> {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');

  // redirect() throws internally, and Next's own throw would otherwise be
  // swallowed by a surrounding catch — so every branch below only ever
  // records what happened, and every actual redirect() call happens
  // after the try/catch has fully exited.
  let errorMessage: string | null = null;
  try {
    const issued = await issueCaseAccess(session.workspaceId, session.userId, caseId, mode);
    if (!issued.party.email) {
      errorMessage = 'This recipient has no email address on file.';
    } else {
      const link = `${env.APP_URL}/r/${issued.token}`;
      await sendInviteAndStashLink(
        session.workspaceId,
        session.userId,
        caseId,
        issued.party.email,
        issued.party.displayName,
        issued.caseRow.name,
        link,
        issued.expiresAt,
      );
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Could not send the invite.';
  }

  if (errorMessage) redirect(`/cases/${caseId}?error=${encodeURIComponent(errorMessage)}`);
  redirect(`/cases/${caseId}`);
}

/** The client lost the email — mint a new link, but leave every existing live link working. */
export async function resendInviteAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get('caseId') ?? '');
  await reissueAndRedirect(caseId, 'resend');
}

/** The link was forwarded to the wrong person — revoke every live link, then mint a fresh one. */
export async function revokeAndReissueAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get('caseId') ?? '');
  await reissueAndRedirect(caseId, 'reissue');
}

/**
 * Stage 7: `approveSubmissionAction`/`requestChangesAction` below.
 *
 * ACL chokepoint 5 (Stage 11's roles-and-tenancy.md): "you cannot review
 * what you cannot read." No role check here beyond an authenticated
 * session — any workspace member may review by default (contributors
 * review; `require_separate_reviewer` and the `can()` choke point are
 * Stage 11 work, not invented early as a `requireRole` call this stage
 * would just have to migrate again).
 *
 * Same redirect() discipline as `reissueAndRedirect` above: `redirect()`
 * throws internally, so every branch here only ever records an outcome,
 * and the actual `redirect()` call happens exactly once, after the
 * try/catch has fully exited.
 */
async function performReviewAndRedirect(
  caseId: string,
  perform: (session: CurrentSession, ctx: { ipAddress?: string; userAgent?: string }) => Promise<void>,
): Promise<void> {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');

  let errorMessage: string | null = null;
  try {
    const h = await headers();
    await perform(session, { ipAddress: clientIp(h), userAgent: userAgent(h) });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Could not record this decision.';
  }

  if (errorMessage) redirect(`/cases/${caseId}?error=${encodeURIComponent(errorMessage)}`);
  redirect(`/cases/${caseId}`);
}

/** Also the "Approve as-is" action — approving a version whose latest decision was `changes_requested`. */
export async function approveSubmissionAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get('caseId') ?? '');
  const submissionVersionId = String(formData.get('submissionVersionId') ?? '');
  const expectedReviewNumber = Number(formData.get('expectedReviewNumber') ?? '0');

  await performReviewAndRedirect(caseId, async (session, ctx) => {
    await approveSubmission(session.workspaceId, {
      caseId,
      submissionVersionId,
      expectedReviewNumber,
      reviewerUserId: session.userId,
      ...ctx,
    });
  });
}

/** Also the "Reopen" action — requesting changes on a version whose latest decision was `approved`. */
export async function requestChangesAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get('caseId') ?? '');
  const submissionVersionId = String(formData.get('submissionVersionId') ?? '');
  const expectedReviewNumber = Number(formData.get('expectedReviewNumber') ?? '0');
  const reason = String(formData.get('reason') ?? '');

  await performReviewAndRedirect(caseId, async (session, ctx) => {
    await requestChanges(session.workspaceId, {
      caseId,
      submissionVersionId,
      expectedReviewNumber,
      reason,
      reviewerUserId: session.userId,
      ...ctx,
    });
  });
}
