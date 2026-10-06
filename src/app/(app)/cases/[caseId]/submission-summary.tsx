import { MdDescription } from 'react-icons/md';
import type { HistoryEntry } from '@/lib/domain/submission-history';
import { formatAnswerValue } from '@/lib/answer-format';

/**
 * One completed submission_version's value or file, shared between the
 * "current" display and each row of "Earlier versions" (Stage 7) — the
 * requester's side of §4.4's "verify what they already submitted". A
 * plain `<a>`, never Next's `<Link>`: prefetch would fire the audited,
 * scan-gated presign before anyone actually clicked, same reasoning as
 * the recipient's own completed-item.tsx.
 */
export function SubmissionSummary({ caseId, entry }: { caseId: string; entry: HistoryEntry }) {
  const { submissionVersion, fileAsset, answer } = entry;
  const answerText = answer ? formatAnswerValue(answer) : null;

  return (
    <div>
      <p className="text-body-small text-md-on-surface-variant">
        Version {submissionVersion.versionNumber} · {submissionVersion.submittedAt.toLocaleDateString()}
      </p>
      {fileAsset && (
        <a
          href={`/cases/${caseId}/file/${fileAsset.id}`}
          className="mt-1 flex items-center gap-2 text-label-large text-md-primary"
        >
          <MdDescription aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
          <span className="break-all">{fileAsset.originalFilename}</span>
        </a>
      )}
      {!fileAsset && answerText && (
        <p className="mt-1 text-body-medium text-md-on-surface">{answerText}</p>
      )}
    </div>
  );
}
