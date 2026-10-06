import {
  MdCheckCircle,
  MdEditNote,
  MdErrorOutline,
  MdEventBusy,
  MdOutlineMarkEmailRead,
  MdRateReview,
  MdSchedule,
  MdSend,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import { Card } from '@/components/ui/card';
import { TextArea } from '@/components/ui/text-area';
import { SubmitButton } from '@/components/ui/submit-button';
import type { CaseReminderPanel } from '@/lib/domain/reminder';
import { formatDateTime, formatRelative } from '@/lib/format-time';
import { sendReminderAction } from '../actions';

const ITEM_ICON: Record<'awaiting_recipient' | 'changes_requested', IconType> = {
  awaiting_recipient: MdSchedule,
  changes_requested: MdEditNote,
};

/**
 * Stage 8.5's reminder card: what would be sent, an optional note, the
 * send button, and the history of what's already gone out. Shown next to
 * "Recipient access" rather than folded into it, since one is about the
 * link (who can get in) and this is about chasing (who's being nudged).
 */
export function ReminderPanel({
  caseId,
  panel,
  now,
}: {
  caseId: string;
  panel: CaseReminderPanel;
  now: Date;
}) {
  const { eligibility, items, recipientEmail, variant, history } = panel;
  const visibleHistory = history.slice(0, 5);
  const earlierHistory = history.slice(5);

  return (
    <Card variant="outlined" className="mt-3">
      {eligibility.ok ? (
        <>
          <p className="text-body-medium text-md-on-surface">
            Email {recipientEmail} a reminder listing only what&apos;s still outstanding:
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {items.map((item) => {
              const Icon = ITEM_ICON[item.state];
              return (
                <li key={item.assignmentId} className="text-body-small text-md-on-surface">
                  <span className="flex items-center gap-1.5">
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-md-on-surface-variant" />
                    {item.title}
                  </span>
                  {item.state === 'changes_requested' && item.reason && (
                    <span className="ml-5.5 block text-md-on-surface-variant">
                      Changes requested: {item.reason}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-body-small text-md-on-surface-variant">
            {variant === 'case_reminder_unopened'
              ? "They haven't opened their link yet."
              : "They've opened their link."}
          </p>

          <form action={sendReminderAction} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="returnTo" value="case" />
            <TextArea
              label="Add a note (optional)"
              name="note"
              maxLength={500}
              rows={3}
              supportingText="Plain text. Appears above the list in the email."
            />
            <div>
              <SubmitButton variant="filled" pendingLabel="Sending…">
                <MdSend aria-hidden="true" className="h-4.5 w-4.5" />
                Send reminder
              </SubmitButton>
            </div>
          </form>
        </>
      ) : (
        <IneligibleLine eligibility={eligibility} now={now} />
      )}

      {history.length > 0 && (
        <div className="mt-5 border-t border-md-outline-variant pt-4">
          <p className="text-label-large text-md-on-surface-variant">Emails to recipient</p>
          <ul className="mt-2 flex flex-col gap-2">
            {visibleHistory.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} now={now} />
            ))}
          </ul>
          {earlierHistory.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-label-large text-md-on-surface-variant outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2">
                Show {earlierHistory.length} earlier
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {earlierHistory.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} now={now} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

function IneligibleLine({
  eligibility,
  now,
}: {
  eligibility: Extract<CaseReminderPanel['eligibility'], { ok: false }>;
  now: Date;
}) {
  if (eligibility.reason === 'complete') {
    return (
      <p className="flex items-center gap-2 text-body-small text-md-on-surface-variant">
        <MdCheckCircle aria-hidden="true" className="h-4.5 w-4.5 shrink-0 text-md-primary" />
        This case is complete — there&apos;s nothing to remind them about.
      </p>
    );
  }
  if (eligibility.reason === 'nothing_outstanding') {
    return (
      <p className="flex items-center gap-2 text-body-small text-md-on-surface-variant">
        <MdRateReview aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
        Nothing is waiting on the recipient right now — check Requirements below for items that need your
        review.
      </p>
    );
  }
  if (eligibility.reason === 'no_email') {
    return (
      <p className="flex items-center gap-2 text-body-small text-md-on-surface-variant">
        <MdEventBusy aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
        This recipient has no email address, so reminders can&apos;t be sent.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-body-small text-md-on-surface-variant">
      <MdSchedule aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
      A reminder was already sent — you can send another{' '}
      {eligibility.availableAt ? formatRelative(eligibility.availableAt, now) : 'shortly'}.
    </p>
  );
}

function HistoryRow({ entry, now }: { entry: CaseReminderPanel['history'][number]; now: Date }) {
  const isInvite = entry.templateRef === 'case_invite';
  const kind = isInvite ? 'Invite' : 'Reminder';
  const failed = entry.status === 'failed';
  const StatusIcon = failed ? MdErrorOutline : MdOutlineMarkEmailRead;

  return (
    <li className="flex items-start gap-2 text-body-small">
      <StatusIcon
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${failed ? 'text-md-error' : 'text-md-on-surface-variant'}`}
      />
      <span className={failed ? 'text-md-error' : 'text-md-on-surface'}>
        <span title={formatDateTime(entry.createdAt)}>
          {kind}
          {!isInvite && entry.itemCount > 0 ? ` (${entry.itemCount} item${entry.itemCount === 1 ? '' : 's'})` : ''}
          {' · '}
          {formatRelative(entry.createdAt, now)}
        </span>
        {entry.sentByName && <span className="text-md-on-surface-variant"> · by {entry.sentByName}</span>}
        {entry.note && <span className="mt-0.5 block text-md-on-surface-variant">&ldquo;{entry.note}&rdquo;</span>}
        {failed && entry.error && <span className="mt-0.5 block">{entry.error}</span>}
      </span>
    </li>
  );
}
