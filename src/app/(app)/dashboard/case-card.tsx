import Link from 'next/link';
import {
  MdCheckCircle,
  MdMailOutline,
  MdRateReview,
  MdSchedule,
  MdSend,
  MdVisibility,
} from 'react-icons/md';
import type { DashboardCase } from '@/lib/domain/case';
import type { CaseStatusCounts, CaseStatusResult } from '@/lib/domain/case-status';
import { daysOpen, formatRelative } from '@/lib/format-time';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { sendReminderAction } from '@/app/(app)/cases/actions';
import { ReturnQueryInput } from './return-query';

type Status = CaseStatusResult['status'];

const ACTIVITY_LABEL: Record<string, string> = {
  'case.viewed': 'Viewed the link',
  'assignment.started': 'Started an item',
  'assignment.submitted': 'Submitted an item',
};

const MAX_ITEMS_SHOWN = 5;

function summaryLabel(status: Status, counts: CaseStatusCounts): string {
  if (status === 'complete') return 'Complete';
  if (status === 'needs_review') return `Needs review · ${counts.needsReview}`;
  return `${counts.accepted} of ${counts.required} accepted`;
}

function activityLine(row: DashboardCase, now: Date): string {
  if (!row.lastRecipientActivity) return "Recipient hasn't opened the link yet";
  const label = ACTIVITY_LABEL[row.lastRecipientActivity.eventType] ?? 'Was active';
  return `${label} ${formatRelative(row.lastRecipientActivity.occurredAt, now)}`;
}

function contactLine(row: DashboardCase, now: Date): string {
  if (!row.lastContact) return 'Not yet contacted';
  if (row.lastContact.status === 'failed') return 'Last email failed to send';
  const kind = row.lastContact.templateRef === 'case_invite' ? 'Invite sent' : 'Reminded';
  return `${kind} ${formatRelative(row.lastContact.createdAt, now)}`;
}

function OutstandingItems({ row }: { row: DashboardCase }) {
  const recipient = row.party?.displayName ?? 'the recipient';
  const shown = row.blockingItems.slice(0, MAX_ITEMS_SHOWN);
  const hidden = row.blockingItems.length - shown.length;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {row.status === 'needs_review' && (
        <p className="flex items-center gap-1.5 text-body-medium text-md-on-surface">
          <MdRateReview aria-hidden="true" className="h-4.5 w-4.5 shrink-0 text-md-tertiary" />
          {row.counts.needsReview} item{row.counts.needsReview === 1 ? '' : 's'} need
          {row.counts.needsReview === 1 ? 's' : ''} your review
        </p>
      )}
      {row.status === 'complete' && (
        <p className="flex items-center gap-1.5 text-body-medium text-md-on-surface">
          <MdCheckCircle aria-hidden="true" className="h-4.5 w-4.5 shrink-0 text-md-primary" />
          Everything accepted
        </p>
      )}
      {shown.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-body-medium text-md-on-surface">
            <MdSchedule
              aria-hidden="true"
              className="h-4.5 w-4.5 shrink-0 text-md-on-surface-variant"
            />
            {row.status === 'needs_review'
              ? `Also waiting on ${recipient} for:`
              : `Waiting on ${recipient} for:`}
          </p>
          <ul className="mt-1 ml-6 flex flex-col gap-1">
            {shown.map((item) => (
              <li key={item.assignmentId} className="text-body-medium text-md-on-surface">
                <span className="flex flex-wrap items-center gap-x-2">
                  {item.title}
                  {item.state === 'changes_requested' && (
                    <span className="rounded-xs bg-md-error-container px-1.5 text-label-small font-medium text-md-on-error-container">
                      Changes requested
                    </span>
                  )}
                </span>
                {item.state === 'changes_requested' && item.reason && (
                  <span className="line-clamp-2 text-body-small text-md-on-surface-variant">
                    {item.reason}
                  </span>
                )}
              </li>
            ))}
            {hidden > 0 && (
              <li className="text-body-small text-md-on-surface-variant">+{hidden} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One case in the dashboard's list view (the Stage 8.5 case card). Server-rendered; the list decides which cards show. */
export function CaseCard({ row, now }: { row: DashboardCase; now: Date }) {
  const overdue =
    row.case.dueAt && row.case.dueAt.getTime() < now.getTime() && row.status !== 'complete';
  const showReview = row.status === 'needs_review';

  return (
    <Card variant="outlined" className="relative">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/cases/${row.case.id}`}
          className="text-title-medium text-md-on-surface after:absolute after:inset-0 after:content-['']"
        >
          {row.case.name}
        </Link>
        <span className="shrink-0 text-label-large text-md-on-surface-variant">
          {summaryLabel(row.status, row.counts)}
        </span>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-body-small text-md-on-surface-variant">
        <span>{row.templateName}</span>
        <span aria-hidden="true">·</span>
        <span>{row.party?.displayName ?? 'No recipient'}</span>
        <span aria-hidden="true">·</span>
        <span>Open {daysOpen(row.case.createdAt, now)} days</span>
        {row.case.dueAt && (
          <>
            <span aria-hidden="true">·</span>
            <span className={overdue ? 'font-medium text-md-error' : undefined}>
              {overdue ? 'Overdue' : 'Due'} {row.case.dueAt.toLocaleDateString()}
            </span>
          </>
        )}
      </p>

      <OutstandingItems row={row} />

      <div className="mt-4 flex flex-col gap-3 border-t border-md-outline-variant pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap items-center gap-x-1.5 text-body-small text-md-on-surface-variant">
          <MdVisibility aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{activityLine(row, now)}</span>
          <span aria-hidden="true">·</span>
          <MdMailOutline aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className={row.lastContact?.status === 'failed' ? 'text-md-error' : undefined}>
            {contactLine(row, now)}
          </span>
        </p>

        <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
          {showReview && (
            <ButtonLink
              href={`/cases/${row.case.id}`}
              variant="tonal"
              aria-label={`Review ${row.case.name}`}
            >
              <MdRateReview aria-hidden="true" className="h-4.5 w-4.5" />
              Review
            </ButtonLink>
          )}
          {row.reminder.ok ? (
            <form action={sendReminderAction}>
              <input type="hidden" name="caseId" value={row.case.id} />
              <input type="hidden" name="returnTo" value="dashboard" />
              <ReturnQueryInput />
              <SubmitButton variant={showReview ? 'outlined' : 'tonal'} pendingLabel="Sending…">
                <MdSend aria-hidden="true" className="h-4.5 w-4.5" />
                Send reminder
              </SubmitButton>
            </form>
          ) : (
            row.reminder.reason === 'cooldown' &&
            row.lastReminderAt && (
              <p className="text-body-small text-md-on-surface-variant">
                Reminded {formatRelative(row.lastReminderAt, now)}
              </p>
            )
          )}
        </div>
      </div>
    </Card>
  );
}
