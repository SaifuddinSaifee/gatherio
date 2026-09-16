import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  MdBusiness,
  MdCheckCircle,
  MdError,
  MdLink,
  MdMail,
  MdPerson,
  MdRateReview,
  MdSchedule,
  MdSend,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import { getCurrentSession } from '@/db/session';
import { getCaseDetail } from '@/lib/domain/case';
import type { CaseStatusResult } from '@/lib/domain/case-status';
import { getCaseReminderPanel } from '@/lib/domain/reminder';
import { CASE_LINK_FLASH_COOKIE_NAME, readCaseLinkFlash } from '@/lib/case-link-flash';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { resendInviteAction, revokeAndReissueAction } from '../actions';
import { ReviewItem } from './review-item';
import { ReminderPanel } from './reminder-panel';

const CASE_STATUS_DISPLAY: Record<CaseStatusResult['status'], { label: string; Icon: IconType }> = {
  complete: { label: 'Complete', Icon: MdCheckCircle },
  needs_review: { label: 'Needs review', Icon: MdRateReview },
  awaiting_recipient: { label: 'Waiting on recipient', Icon: MdSchedule },
};

/** The most recent invite send failed — history is already newest-first. */
function lastInviteFailed(history: { templateRef: string; status: string }[]): boolean {
  const lastInvite = history.find((h) => h.templateRef === 'case_invite');
  return lastInvite?.status === 'failed';
}

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { caseId } = await params;
  const { error, notice } = await searchParams;

  const detail = await getCaseDetail(session.workspaceId, caseId);
  if (!detail) notFound();

  const now = new Date();
  const reminderPanel = await getCaseReminderPanel(session.workspaceId, caseId, now);

  const cookieStore = await cookies();
  const flashRaw = cookieStore.get(CASE_LINK_FLASH_COOKIE_NAME)?.value;
  const flash = flashRaw ? readCaseLinkFlash(flashRaw, caseId) : null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="text-headline-small font-medium text-md-on-surface">{detail.case.name}</h1>
      <p className="mt-1 text-body-medium text-md-on-surface-variant">
        {detail.templateName} (v{detail.templateVersionNumber})
        {detail.case.dueAt && ` · due ${detail.case.dueAt.toLocaleDateString()}`}
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-label-large text-md-on-surface-variant">
        {(() => {
          const { label, Icon } = CASE_STATUS_DISPLAY[detail.status];
          return (
            <span className="flex items-center gap-1.5">
              <Icon
                aria-hidden="true"
                className={`h-4.5 w-4.5 ${detail.status === 'complete' ? 'text-md-primary' : ''}`}
              />
              {label}
            </span>
          );
        })()}
        <span aria-hidden="true">·</span>
        <span>
          {detail.counts.accepted} of {detail.counts.required} accepted
        </span>
        {detail.counts.needsReview > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{detail.counts.needsReview} needs review</span>
          </>
        )}
        {detail.counts.changesRequested > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{detail.counts.changesRequested} changes requested</span>
          </>
        )}
      </p>

      {notice === 'reminder_sent' && (
        <p role="status" className="mt-4 flex items-center gap-2 text-body-small text-md-primary">
          <MdSend aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
          Reminder sent.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 text-body-small text-md-error">
          <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
          {error}
        </p>
      )}

      <h2 className="mt-8 text-title-medium text-md-on-surface">Recipient access</h2>
      <Card variant="outlined" className="mt-3">
        {flash ? (
          <>
            <p className="flex items-center gap-2 text-title-medium text-md-on-surface">
              <MdLink aria-hidden="true" className="h-5 w-5 text-md-primary" />
              Recipient link
            </p>
            <p className="mt-1 text-body-small text-md-on-surface-variant">
              This link is shown once. Copy it now — Gather stores only a hash of the token, not the
              token itself, so it cannot be shown again.
            </p>
            <code className="mt-3 block break-all rounded-sm bg-md-surface-container-high px-3 py-2 text-body-small text-md-on-surface">
              {flash.link}
            </code>
            <p className="mt-2 text-body-small text-md-on-surface-variant">
              Expires {new Date(flash.expiresAt).toLocaleDateString()}
            </p>
          </>
        ) : lastInviteFailed(reminderPanel.history) ? (
          <p className="flex items-center gap-2 text-body-small text-md-error">
            <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
            The invite email to {detail.party?.email ?? 'the recipient'} couldn&apos;t be sent.
            Resend invite to try again.
          </p>
        ) : (
          <p className="text-body-small text-md-on-surface-variant">
            An invite was sent to {detail.party?.email ?? 'the recipient'}. Use Resend if they never
            received it, or Revoke &amp; reissue if the link went to the wrong person.
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

      <h2 className="mt-8 text-title-medium text-md-on-surface">Reminders</h2>
      <ReminderPanel caseId={caseId} panel={reminderPanel} now={now} />

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
        {detail.requirements.map((item) => (
          <li key={item.requirement.id}>
            <ReviewItem caseId={caseId} item={item} />
          </li>
        ))}
      </ul>
    </main>
  );
}
