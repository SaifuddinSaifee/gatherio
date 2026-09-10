import { MdErrorOutline } from 'react-icons/md';
import type { RecipientRequirementItem } from '@/lib/domain/recipient-view';
import { AnswerField } from './answer-field';
import { UploadField } from './upload-field';
import { AcknowledgeControl } from './acknowledge-control';
import { NotApplicableControl } from './not-applicable-control';

/**
 * One outstanding requirement's shell: title, instructions, acceptance
 * criteria, the changes-requested reason (shown ABOVE the control when
 * present — §4.4), and exactly one of AnswerField / UploadField /
 * AcknowledgeControl. Deliberately not wrapped in a Card — a dense list
 * of items in a plain row is the right shape here (design §48), not a
 * stack of cards.
 */
export function OutstandingItem({
  caseId,
  item,
}: {
  caseId: string;
  item: RecipientRequirementItem;
}) {
  const { requirement, assignment, latestReview } = item;
  const draftValue = typeof assignment.draftValue === 'string' ? assignment.draftValue : '';
  const changesRequested = latestReview?.reviewStatus === 'changes_requested';

  return (
    <div>
      <h3 className="text-title-small font-medium text-md-on-surface">
        {requirement.title}
        {!requirement.required && (
          <span className="ml-2 text-body-small font-normal text-md-on-surface-variant">
            (optional)
          </span>
        )}
      </h3>
      {requirement.instructions && (
        <p className="mt-1 text-body-small text-md-on-surface-variant">{requirement.instructions}</p>
      )}
      {requirement.acceptanceCriteria && (
        <p className="mt-1 text-body-small text-md-on-surface-variant">
          Accepted: {requirement.acceptanceCriteria}
        </p>
      )}

      {changesRequested && latestReview?.reason && (
        <p className="mt-3 flex items-start gap-2 rounded-sm bg-md-error-container px-3 py-2 text-body-small text-md-on-error-container">
          <MdErrorOutline aria-hidden="true" className="mt-0.5 h-4.5 w-4.5 shrink-0" />
          <span>
            <strong>Changes requested:</strong> {latestReview.reason}
          </span>
        </p>
      )}

      {requirement.actionType === 'upload' && (
        <UploadField caseId={caseId} assignmentId={assignment.id} />
      )}

      {requirement.actionType === 'answer' && requirement.answerFieldType && (
        <AnswerField
          caseId={caseId}
          assignmentId={assignment.id}
          answerFieldType={requirement.answerFieldType}
          required={requirement.required}
          options={requirement.options}
          initialValue={draftValue}
        />
      )}

      {requirement.actionType === 'acknowledge' && (
        <AcknowledgeControl
          caseId={caseId}
          assignmentId={assignment.id}
          statement={[requirement.title, requirement.instructions].filter(Boolean).join(' — ')}
        />
      )}

      {!requirement.required && (
        <div className="mt-1">
          <NotApplicableControl caseId={caseId} assignmentId={assignment.id} />
        </div>
      )}
    </div>
  );
}
