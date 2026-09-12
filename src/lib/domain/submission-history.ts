/**
 * "Latest" resolved consistently everywhere it's asked (Stage 7, decision
 * 4): the latest submission_version that actually has content, not merely
 * the highest version_number. `reserveSubmissionVersion` inserts a version
 * row before any bytes exist, so an abandoned upload reservation is a row
 * with no file and no answer — treating it as "latest" would hide a
 * changes-requested reason behind an orphan the recipient never finished.
 *
 * `isCompletedVersion` is exported so every caller (this file,
 * case-status.ts's bulk loader, and anything later) shares one
 * definition of "completed" instead of three that can drift apart.
 */

import { and, desc, eq, or, isNotNull } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import type { Database } from '@/db/client';
import type { Tx } from '@/db/audit';
import type { StoredAnswer } from './answer';

type Executor = Database | Tx;

export const isCompletedVersion = or(
  isNotNull(schema.fileAsset.id),
  isNotNull(schema.submissionAnswer.id),
);

function isStoredAnswerValue(v: unknown): v is StoredAnswer {
  return typeof v === 'object' && v !== null && 'fieldType' in v;
}

export interface CompletedVersionRow {
  submissionVersion: typeof schema.submissionVersion.$inferSelect;
  fileAsset: typeof schema.fileAsset.$inferSelect | null;
  answer: StoredAnswer | null;
}

/**
 * The assignment's latest completed submission_version, or null if it has
 * none. The one function every write-path guard and every read path calls
 * to answer "what's current" — reused by submission.ts's guards,
 * review.ts's "must be the latest version" check, and recipient-view.ts.
 */
export async function latestCompletedVersion(
  ex: Executor,
  workspaceId: WorkspaceId,
  assignmentId: string,
): Promise<CompletedVersionRow | null> {
  const s = scoped(workspaceId);

  const [row] = await ex
    .select({
      submissionVersion: schema.submissionVersion,
      fileAsset: schema.fileAsset,
      answer: schema.submissionAnswer,
    })
    .from(schema.submissionVersion)
    .leftJoin(
      schema.fileAsset,
      eq(schema.fileAsset.submissionVersionId, schema.submissionVersion.id),
    )
    .leftJoin(
      schema.submissionAnswer,
      eq(schema.submissionAnswer.submissionVersionId, schema.submissionVersion.id),
    )
    .where(
      s.where(
        schema.submissionVersion.workspaceId,
        and(eq(schema.submissionVersion.assignmentId, assignmentId), isCompletedVersion),
      ),
    )
    .orderBy(desc(schema.submissionVersion.versionNumber))
    .limit(1);

  if (!row) return null;

  const answerValue = row.answer?.value;
  return {
    submissionVersion: row.submissionVersion,
    fileAsset: row.fileAsset,
    answer: isStoredAnswerValue(answerValue) ? answerValue : null,
  };
}

export interface HistoryEntry extends CompletedVersionRow {
  /** Newest first. */
  reviews: (typeof schema.review.$inferSelect)[];
  latestReview: typeof schema.review.$inferSelect | null;
}

/**
 * Every completed version of one assignment, newest first, each with its
 * full review history (also newest first, by review_number — never by
 * reviewed_at, which can't be trusted to order correctly under
 * concurrent decisions; see the review table's schema comment). N+1 by
 * version, matching the accepted listCases/listTemplates/getRecipientView
 * precedent in this codebase.
 */
export async function loadAssignmentHistory(
  ex: Executor,
  workspaceId: WorkspaceId,
  assignmentId: string,
): Promise<HistoryEntry[]> {
  const s = scoped(workspaceId);

  const rows = await ex
    .select({
      submissionVersion: schema.submissionVersion,
      fileAsset: schema.fileAsset,
      answer: schema.submissionAnswer,
    })
    .from(schema.submissionVersion)
    .leftJoin(
      schema.fileAsset,
      eq(schema.fileAsset.submissionVersionId, schema.submissionVersion.id),
    )
    .leftJoin(
      schema.submissionAnswer,
      eq(schema.submissionAnswer.submissionVersionId, schema.submissionVersion.id),
    )
    .where(
      s.where(
        schema.submissionVersion.workspaceId,
        and(eq(schema.submissionVersion.assignmentId, assignmentId), isCompletedVersion),
      ),
    )
    .orderBy(desc(schema.submissionVersion.versionNumber));

  const entries: HistoryEntry[] = [];
  for (const row of rows) {
    const reviews = await ex
      .select()
      .from(schema.review)
      .where(
        s.where(
          schema.review.workspaceId,
          eq(schema.review.submissionVersionId, row.submissionVersion.id),
        ),
      )
      .orderBy(desc(schema.review.reviewNumber));

    const answerValue = row.answer?.value;
    entries.push({
      submissionVersion: row.submissionVersion,
      fileAsset: row.fileAsset,
      answer: isStoredAnswerValue(answerValue) ? answerValue : null,
      reviews,
      latestReview: reviews[0] ?? null,
    });
  }

  return entries;
}
