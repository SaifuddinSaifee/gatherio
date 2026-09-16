import Link from 'next/link';
import {
  MdCheckCircle,
  MdExpandMore,
  MdMailOutline,
  MdRateReview,
  MdSchedule,
  MdSend,
  MdVisibility,
} from 'react-icons/md';
import type { DashboardCase } from '@/lib/domain/case';
import type { CaseStatusCounts, CaseStatusResult } from '@/lib/domain/case-status';
import {
  filterCounts,
  sortForDashboard,
  type DashboardFilter,
} from '@/lib/domain/dashboard';
import { daysOpen, formatRelative } from '@/lib/format-time';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { FilterChip } from '@/components/ui/filter-chip';
import { sendReminderAction } from '@/app/(app)/cases/actions';

type Status = CaseStatusResult['status'];

const FILTER_LABEL: Record<DashboardFilter, string> = {
  all: 'All',
  needs_review: 'Needs your review',
  awaiting_recipient: 'Waiting on recipient',
  complete: 'Complete',
};

const EMPTY_STATE_LABEL: Record<Exclude<DashboardFilter, 'all'>, string> = {
  needs_review: 'Nothing needs your review right now.',
  awaiting_recipient: 'Nothing is waiting on a recipient right now.',
  complete: 'No cases are complete yet.',
};

const GROUPS: { status: Status; title: string; description: string }[] = [
  { status: 'needs_review', title: 'Needs your review', description: 'Submissions waiting for your decision.' },
  { status: 'awaiting_recipient', title: 'Waiting on recipient', description: 'Items the recipient still owes.' },
  { status: 'complete', title: 'Complete', description: 'Every required item accepted.' },
];

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
            <MdSchedule aria-hidden="true" className="h-4.5 w-4.5 shrink-0 text-md-on-surface-variant" />
            {row.status === 'needs_review' ? `Also waiting on ${recipient} for:` : `Waiting on ${recipient} for:`}
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
                  <span className="line-clamp-2 text-body-small text-md-on-surface-variant">{item.reason}</span>
                )}
              </li>
            ))}
            {hidden > 0 && <li className="text-body-small text-md-on-surface-variant">+{hidden} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function CaseCard({ row, filter, now }: { row: DashboardCase; filter: DashboardFilter; now: Date }) {
  const overdue = row.case.dueAt && row.case.dueAt.getTime() < now.getTime() && row.status !== 'complete';
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
        <span className="shrink-0 text-label-large text-md-on-surface-variant">{summaryLabel(row.status, row.counts)}</span>
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
          <span className={row.lastContact?.status === 'failed' ? 'text-md-error' : undefined}>{contactLine(row, now)}</span>
        </p>

        <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
          {showReview && (
            <ButtonLink href={`/cases/${row.case.id}`} variant="tonal" aria-label={`Review ${row.case.name}`}>
              <MdRateReview aria-hidden="true" className="h-4.5 w-4.5" />
              Review
            </ButtonLink>
          )}
          {row.reminder.ok ? (
            <form action={sendReminderAction}>
              <input type="hidden" name="caseId" value={row.case.id} />
              <input type="hidden" name="returnTo" value="dashboard" />
              <input type="hidden" name="filter" value={filter} />
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

function GroupHeading({ id, title, count, description }: { id: string; title: string; count: number; description: string }) {
  return (
    <div>
      <h2 id={id} className="text-title-medium font-medium text-md-on-surface">
        {title} <span className="text-md-on-surface-variant">({count})</span>
      </h2>
      <p className="text-body-small text-md-on-surface-variant">{description}</p>
    </div>
  );
}

/**
 * The dashboard's list view (Stage 8.6 decision 9): the Stage 8.5 case
 * cards, grouped by whose move it is so each case reads as an action
 * item. Server-rendered, no client JS beyond the reminder submit button.
 */
export function CasesList({ cases, filter, now }: { cases: DashboardCase[]; filter: DashboardFilter; now: Date }) {
  const counts = filterCounts(cases);
  const visible = sortForDashboard(cases.filter((row) => filter === 'all' || row.status === filter));
  const groups = GROUPS.filter((group) => filter === 'all' || group.status === filter)
    .map((group) => ({ ...group, rows: visible.filter((row) => row.status === group.status) }))
    .filter((group) => group.rows.length > 0);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(['all', 'needs_review', 'awaiting_recipient', 'complete'] as const).map((f) => (
          <FilterChip key={f} href={f === 'all' ? '/dashboard' : `/dashboard?filter=${f}`} selected={filter === f} count={counts[f]}>
            {FILTER_LABEL[f]}
          </FilterChip>
        ))}
      </div>

      {groups.length === 0 ? (
        <Card className="mt-8 flex items-center gap-3">
          <MdCheckCircle aria-hidden="true" className="h-6 w-6 shrink-0 text-md-on-surface-variant" />
          <p className="text-body-medium text-md-on-surface-variant">
            {filter === 'all' ? 'No cases match.' : EMPTY_STATE_LABEL[filter]}
          </p>
        </Card>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {groups.map((group) => {
            const headingId = `group-${group.status}`;
            const list = (
              <ul className="mt-4 flex flex-col gap-3">
                {group.rows.map((row) => (
                  <li key={row.case.id}>
                    <CaseCard row={row} filter={filter} now={now} />
                  </li>
                ))}
              </ul>
            );

            // Complete cases need no action, so they stay folded away unless that's the filter.
            if (group.status === 'complete' && filter === 'all') {
              return (
                <details key={group.status} className="group/complete">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-md-primary [&::-webkit-details-marker]:hidden">
                    <GroupHeading id={headingId} title={group.title} count={group.rows.length} description={group.description} />
                    <MdExpandMore
                      aria-hidden="true"
                      className="h-6 w-6 shrink-0 text-md-on-surface-variant transition-transform duration-(--duration-effects-default) group-open/complete:rotate-180"
                    />
                  </summary>
                  {list}
                </details>
              );
            }

            return (
              <section key={group.status} aria-labelledby={headingId}>
                <GroupHeading id={headingId} title={group.title} count={group.rows.length} description={group.description} />
                {list}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
