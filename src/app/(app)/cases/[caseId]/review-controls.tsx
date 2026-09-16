import { MdCheck, MdEditNote } from 'react-icons/md';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import type { ItemState } from '@/lib/domain/case-status';
import { approveSubmissionAction, requestChangesAction } from '../actions';

/**
 * The requester's decision forms for one item, chosen by its derived
 * state (Stage 7). Zero client JS: plain `<form action={serverAction}>`
 * posts and native `<details>` discloses the reason field — everything
 * here works with JavaScript disabled. Every form posts the exact
 * `submissionVersionId` and `expectedReviewNumber` the page rendered, so
 * a stale page (someone else reviewed it in the meantime) fails safely
 * as `ReviewConflictError` rather than silently overwriting a decision.
 *
 * `needs_review` gets both Approve and Request changes — never a single
 * competing filled button next to another (§26/§82), so Approve is
 * `tonal`. `changes_requested`/`accepted` each get exactly one text-level
 * action (Approve as-is / Reopen), since the other decision is already
 * in effect.
 */
export function ReviewControls({
  caseId,
  submissionVersionId,
  expectedReviewNumber,
  state,
}: {
  caseId: string;
  submissionVersionId: string;
  expectedReviewNumber: number;
  state: ItemState;
}) {
  if (state === 'needs_review') {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action={approveSubmissionAction}>
          <ReviewHiddenFields caseId={caseId} submissionVersionId={submissionVersionId} expectedReviewNumber={expectedReviewNumber} />
          <Button type="submit" variant="tonal">
            <MdCheck aria-hidden="true" className="h-4.5 w-4.5" />
            Approve
          </Button>
        </form>
        <RequestChangesDisclosure
          caseId={caseId}
          submissionVersionId={submissionVersionId}
          expectedReviewNumber={expectedReviewNumber}
          label="Request changes"
          variant="outlined"
        />
      </div>
    );
  }

  if (state === 'changes_requested') {
    return (
      <form action={approveSubmissionAction} className="mt-3">
        <ReviewHiddenFields caseId={caseId} submissionVersionId={submissionVersionId} expectedReviewNumber={expectedReviewNumber} />
        <Button type="submit" variant="text">
          Approve as-is
        </Button>
      </form>
    );
  }

  if (state === 'accepted') {
    return (
      <div className="mt-3">
        <RequestChangesDisclosure
          caseId={caseId}
          submissionVersionId={submissionVersionId}
          expectedReviewNumber={expectedReviewNumber}
          label="Reopen"
          variant="text"
        />
      </div>
    );
  }

  // awaiting_recipient (nothing submitted yet), rejected (terminal,
  // unreachable today), waived, cancelled — none of these have a
  // requester-side decision to make right now.
  return null;
}

function ReviewHiddenFields({
  caseId,
  submissionVersionId,
  expectedReviewNumber,
}: {
  caseId: string;
  submissionVersionId: string;
  expectedReviewNumber: number;
}) {
  return (
    <>
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="submissionVersionId" value={submissionVersionId} />
      <input type="hidden" name="expectedReviewNumber" value={expectedReviewNumber} />
    </>
  );
}

function RequestChangesDisclosure({
  caseId,
  submissionVersionId,
  expectedReviewNumber,
  label,
  variant,
}: {
  caseId: string;
  submissionVersionId: string;
  expectedReviewNumber: number;
  label: string;
  variant: 'outlined' | 'text';
}) {
  return (
    <details className="group">
      <summary
        className={cn(
          'inline-flex cursor-pointer list-none items-center gap-2 rounded-full text-label-large outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden',
          variant === 'outlined'
            ? 'h-10 border border-md-outline px-4 text-md-primary'
            : 'h-10 px-1 text-md-on-surface-variant',
        )}
      >
        <MdEditNote aria-hidden="true" className="h-4.5 w-4.5" />
        {label}
      </summary>
      <form action={requestChangesAction} className="mt-3 flex flex-col gap-3">
        <ReviewHiddenFields caseId={caseId} submissionVersionId={submissionVersionId} expectedReviewNumber={expectedReviewNumber} />
        <TextArea
          label="What needs to change?"
          name="reason"
          required
          maxLength={1000}
          supportingText="Shown to the recipient on this item. Send a reminder below to email it to them."
        />
        <div>
          <Button type="submit" variant="filled">
            Send request
          </Button>
        </div>
      </form>
    </details>
  );
}
