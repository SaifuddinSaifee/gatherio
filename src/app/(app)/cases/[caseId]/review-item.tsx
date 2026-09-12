import type { IconType } from 'react-icons';
import {
  MdCancel,
  MdCheckCircle,
  MdEditNote,
  MdErrorOutline,
  MdRateReview,
  MdRemoveCircleOutline,
  MdSchedule,
  MdVisibility,
} from 'react-icons/md';
import { Card } from '@/components/ui/card';
import type { CaseRequirementItem } from '@/lib/domain/case';
import type { ItemState } from '@/lib/domain/case-status';
import { SubmissionSummary } from './submission-summary';
import { ReviewControls } from './review-controls';

const FULFILMENT_LABEL: Record<string, string> = {
  pending: 'Pending',
  viewed: 'Viewed',
  in_progress: 'In progress',
};

const FULFILMENT_ICON: Record<string, IconType> = {
  pending: MdSchedule,
  viewed: MdVisibility,
  in_progress: MdEditNote,
};

const STATE_DISPLAY: Partial<Record<ItemState, { label: string; Icon: IconType }>> = {
  needs_review: { label: 'Needs review', Icon: MdRateReview },
  changes_requested: { label: 'Changes requested', Icon: MdEditNote },
  rejected: { label: 'Rejected', Icon: MdCancel },
  waived: { label: 'Waived', Icon: MdRemoveCircleOutline },
  cancelled: { label: 'Cancelled', Icon: MdCancel },
};

/**
 * The state badge shown next to each requirement's title. `awaiting_
 * recipient` deliberately keeps rendering the plain fulfilment label
 * ("Pending"/"Viewed"/"In progress") it always has — that's still the
 * useful fact while nothing has been submitted yet, and Stage 6's
 * mail-scanner e2e test asserts on that exact text. Every other state is
 * new to Stage 7's review loop and gets its own label.
 */
function stateBadge(item: CaseRequirementItem): { label: string; Icon: IconType } {
  if (item.state === 'awaiting_recipient') {
    const fulfilment = item.assignment?.fulfilmentStatus ?? 'pending';
    return { label: FULFILMENT_LABEL[fulfilment] ?? fulfilment, Icon: FULFILMENT_ICON[fulfilment] ?? MdSchedule };
  }
  if (item.state === 'accepted') {
    const isAcknowledgement = item.history[0]?.answer?.fieldType === 'acknowledge';
    return { label: isAcknowledgement ? 'Received' : 'Approved', Icon: MdCheckCircle };
  }
  return STATE_DISPLAY[item.state] ?? { label: item.state, Icon: MdSchedule };
}

/**
 * One requirement's full review picture (Stage 7): title, state, the
 * latest completed submission (if any), the changes-requested reason
 * when that's the current decision, the review controls for that state,
 * and a collapsed "Earlier versions" history — this is where journey 2's
 * "both versions linked in history" becomes visible to the requester.
 */
export function ReviewItem({ caseId, item }: { caseId: string; item: CaseRequirementItem }) {
  const { requirement, assignment, history, state } = item;
  const latest = history[0] ?? null;
  const latestReview = latest?.latestReview ?? null;
  const isAcknowledgement = latest?.answer?.fieldType === 'acknowledge';
  const { label, Icon } = stateBadge(item);
  const earlierVersions = history.slice(1);

  return (
    <Card variant="outlined">
      <div className="flex items-start justify-between gap-3">
        <p className="text-title-small font-medium text-md-on-surface">{requirement.title}</p>
        <span className="flex shrink-0 items-center gap-1.5 text-label-large text-md-on-surface-variant">
          <Icon aria-hidden="true" className="h-4.5 w-4.5" />
          {label}
        </span>
      </div>

      {!assignment && (
        <p className="mt-2 text-body-small text-md-on-surface-variant">No recipient assigned.</p>
      )}

      {assignment && latest && <SubmissionSummary caseId={caseId} entry={latest} />}

      {state === 'changes_requested' && latestReview?.reason && (
        <p className="mt-2 flex items-start gap-2 rounded-sm bg-md-error-container px-3 py-2 text-body-small text-md-on-error-container">
          <MdErrorOutline aria-hidden="true" className="mt-0.5 h-4.5 w-4.5 shrink-0" />
          <span>
            <strong>You requested changes:</strong> {latestReview.reason}
          </span>
        </p>
      )}

      {assignment && latest && !isAcknowledgement && (
        <ReviewControls
          caseId={caseId}
          submissionVersionId={latest.submissionVersion.id}
          expectedReviewNumber={latestReview?.reviewNumber ?? 0}
          state={state}
        />
      )}

      {earlierVersions.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-label-large text-md-on-surface-variant outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2">
            Earlier versions ({earlierVersions.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-4 border-l-2 border-md-outline-variant pl-4">
            {earlierVersions.map((entry) => (
              <li key={entry.submissionVersion.id}>
                <SubmissionSummary caseId={caseId} entry={entry} />
                {entry.reviews.map((review) => (
                  <p
                    key={review.id}
                    className={
                      review.reviewStatus === 'approved'
                        ? 'mt-1 text-body-small text-md-primary'
                        : 'mt-1 flex items-start gap-2 rounded-sm bg-md-error-container px-3 py-2 text-body-small text-md-on-error-container'
                    }
                  >
                    {review.reviewStatus === 'approved'
                      ? `Approved · ${review.reviewedAt.toLocaleDateString()}`
                      : `Changes requested · ${review.reviewedAt.toLocaleDateString()}: ${review.reason}`}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
