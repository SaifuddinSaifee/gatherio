import { MdCheckCircle, MdDescription, MdErrorOutline } from 'react-icons/md';
import type { RecipientRequirementItem } from '@/lib/domain/recipient-view';
import type { StoredAnswer } from '@/lib/domain/answer';

function formatAnswerValue(answer: StoredAnswer): string {
  switch (answer.fieldType) {
    case 'short_text':
    case 'long_text':
      return answer.text;
    case 'date':
      return answer.date;
    case 'choice':
      return answer.choice;
    case 'yes_no':
      return answer.yes ? 'Yes' : 'No';
    case 'acknowledge':
      return 'Acknowledged';
    case 'not_applicable':
      return "Marked as not applicable";
  }
}

/**
 * One completed requirement's summary row, rendered inside the native
 * <details> disclosure (page.tsx) — recipients can verify what they
 * already submitted, when, and whether it was accepted (§4.4). File
 * downloads use a plain <a>, never Next's <Link>: a <Link> prefetches on
 * hover/viewport-entry, which would fire the scan-gated presign (and its
 * file.downloaded audit write) before the recipient ever actually
 * clicked.
 */
export function CompletedItem({
  caseId,
  item,
}: {
  caseId: string;
  item: RecipientRequirementItem;
}) {
  const { requirement, assignment, latestSubmission, latestReview } = item;
  const fileAsset = latestSubmission?.fileAsset;
  const answerText = latestSubmission?.answer ? formatAnswerValue(latestSubmission.answer) : null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <MdCheckCircle aria-hidden="true" className="h-4.5 w-4.5 shrink-0 text-md-primary" />
        <h3 className="text-title-small font-medium text-md-on-surface">{requirement.title}</h3>
      </div>

      {assignment.submittedAt && (
        <p className="mt-1 text-body-small text-md-on-surface-variant">
          Submitted {assignment.submittedAt.toLocaleDateString()}
        </p>
      )}

      {fileAsset && (
        <a
          href={`/r/c/${caseId}/file/${fileAsset.id}`}
          className="mt-2 flex items-center gap-2 text-label-large text-md-primary"
        >
          <MdDescription aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
          <span className="break-all">{fileAsset.originalFilename}</span>
        </a>
      )}

      {!fileAsset && answerText && (
        <p className="mt-1 text-body-medium text-md-on-surface">{answerText}</p>
      )}

      {latestReview?.reviewStatus === 'approved' && (
        <p className="mt-2 text-body-small text-md-primary">Approved</p>
      )}
      {latestReview?.reviewStatus === 'rejected' && latestReview.reason && (
        <p className="mt-2 flex items-start gap-2 rounded-sm bg-md-error-container px-3 py-2 text-body-small text-md-on-error-container">
          <MdErrorOutline aria-hidden="true" className="mt-0.5 h-4.5 w-4.5 shrink-0" />
          {latestReview.reason}
        </p>
      )}
    </div>
  );
}
