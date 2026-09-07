import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  MdBusiness,
  MdCancel,
  MdCheckCircle,
  MdEditNote,
  MdError,
  MdLink,
  MdMail,
  MdPerson,
  MdRemoveCircleOutline,
  MdSchedule,
  MdVisibility,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { getCaseDetail } from '@/lib/domain/case';
import { CASE_LINK_FLASH_COOKIE_NAME, readCaseLinkFlash } from '@/lib/case-link-flash';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { resendInviteAction, revokeAndReissueAction } from '../actions';

const FULFILMENT_LABEL: Record<string, string> = {
  pending: 'Pending',
  viewed: 'Viewed',
  in_progress: 'In progress',
  submitted: 'Submitted',
  waived: 'Waived',
  cancelled: 'Cancelled',
};

const FULFILMENT_ICON: Record<string, IconType> = {
  pending: MdSchedule,
  viewed: MdVisibility,
  in_progress: MdEditNote,
  submitted: MdCheckCircle,
  waived: MdRemoveCircleOutline,
  cancelled: MdCancel,
};

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { caseId } = await params;
  const { error } = await searchParams;

  const detail = await getCaseDetail(session.workspaceId, caseId);
  if (!detail) notFound();

  const [workspace] = await Promise.all([getWorkspaceById(session.workspaceId)]);

  const cookieStore = await cookies();
  const flashRaw = cookieStore.get(CASE_LINK_FLASH_COOKIE_NAME)?.value;
  const flash = flashRaw ? readCaseLinkFlash(flashRaw, caseId) : null;

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-headline-small font-medium text-md-on-surface">{detail.case.name}</h1>
        <p className="mt-1 text-body-medium text-md-on-surface-variant">
          {detail.templateName} (v{detail.templateVersionNumber})
          {detail.case.dueAt && ` · due ${detail.case.dueAt.toLocaleDateString()}`}
        </p>

        <h2 className="mt-8 text-title-medium text-md-on-surface">Recipient access</h2>
        <Card variant="outlined" className="mt-3">
          {error && (
            <p role="alert" className="mb-3 flex items-center gap-2 text-body-small text-md-error">
              <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
              {error}
            </p>
          )}

          {flash ? (
            <>
              <p className="flex items-center gap-2 text-title-medium text-md-on-surface">
                <MdLink aria-hidden="true" className="h-5 w-5 text-md-primary" />
                Recipient link
              </p>
              <p className="mt-1 text-body-small text-md-on-surface-variant">
                This link is shown once. Copy it now — Gather stores only a hash of the token, not
                the token itself, so it cannot be shown again.
              </p>
              <code className="mt-3 block break-all rounded-sm bg-md-surface-container-high px-3 py-2 text-body-small text-md-on-surface">
                {flash.link}
              </code>
              <p className="mt-2 text-body-small text-md-on-surface-variant">
                Expires {new Date(flash.expiresAt).toLocaleDateString()}
              </p>
            </>
          ) : (
            <p className="text-body-small text-md-on-surface-variant">
              An invite was sent to {detail.party?.email ?? 'the recipient'}. Use Resend if they
              never received it, or Revoke &amp; reissue if the link went to the wrong person.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <form action={resendInviteAction}>
              <input type="hidden" name="caseId" value={caseId} />
              <Button type="submit" variant="outlined">
                Resend invite
              </Button>
            </form>
            <form action={revokeAndReissueAction}>
              <input type="hidden" name="caseId" value={caseId} />
              <Button type="submit" variant="text">
                Revoke &amp; reissue
              </Button>
            </form>
          </div>
        </Card>

        <h2 className="mt-8 text-title-medium text-md-on-surface">Recipient</h2>
        <Card className="mt-3">
          <p className="flex items-center gap-2 text-body-medium text-md-on-surface">
            <MdPerson aria-hidden="true" className="h-5 w-5 text-md-on-surface-variant" />
            {detail.party?.displayName}
          </p>
          {detail.party?.organizationName && (
            <p className="mt-1 flex items-center gap-2 text-body-small text-md-on-surface-variant">
              <MdBusiness aria-hidden="true" className="h-4.5 w-4.5" />
              {detail.party.organizationName}
            </p>
          )}
          {detail.party?.email && (
            <p className="mt-1 flex items-center gap-2 text-body-small text-md-on-surface-variant">
              <MdMail aria-hidden="true" className="h-4.5 w-4.5" />
              {detail.party.email}
            </p>
          )}
        </Card>

        <h2 className="mt-8 text-title-medium text-md-on-surface">Requirements</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {detail.requirements.map(({ requirement, assignment }) => {
            const StatusIcon = assignment ? FULFILMENT_ICON[assignment.fulfilmentStatus] : null;
            return (
              <li key={requirement.id}>
                <Card className="flex items-center justify-between">
                  <p className="text-body-medium text-md-on-surface">{requirement.title}</p>
                  <span className="flex items-center gap-1.5 text-label-large text-md-on-surface-variant">
                    {StatusIcon && <StatusIcon aria-hidden="true" className="h-4.5 w-4.5" />}
                    {assignment ? FULFILMENT_LABEL[assignment.fulfilmentStatus] : '—'}
                  </span>
                </Card>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
