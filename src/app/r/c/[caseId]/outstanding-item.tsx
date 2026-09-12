import { MdDescription, MdErrorOutline } from 'react-icons/md';
import type { RecipientRequirementItem } from '@/lib/domain/recipient-view';
import { answerToFormValue, formatAnswerValue } from '@/lib/answer-format';
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
 *
 * Stage 7: a `changes_requested` item also shows what was actually sent
 * — the recipient shouldn't have to remember their last answer or
 * re-find the file they uploaded just to see what's being corrected —
 * and prefills a text-like AnswerField with it so a one-word fix isn't a
 * full retype.
 */
export function OutstandingItem({
  caseId,
  item,
}: {
  caseId: string;
  item: RecipientRequirementItem;
}) {
  const { requirement, assignment, latestSubmission, latestReview } = item;
  const changesRequested = latestReview?.reviewStatus === 'changes_requested';
  const previousAnswer = changesRequested ? latestSubmission?.answer : null;
  const draftValue = typeof assignment.draftValue === 'string' ? assignment.draftValue : '';
  const initialValue = draftValue || (previousAnswer ? answerToFormValue(previousAnswer) : '');

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

      {changesRequested && latestSubmission?.fileAsset && (
        <p className="mt-2 flex items-center gap-2 text-body-small text-md-on-surface-variant">
          <MdDescription aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
          <span className="break-all">You sent: {latestSubmission.fileAsset.originalFilename}</span>
        </p>
      )}
      {changesRequested && previousAnswer && (
        <p className="mt-2 text-body-small text-md-on-surface-variant">
          You sent: {formatAnswerValue(previousAnswer)}
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
          initialValue={initialValue}
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
