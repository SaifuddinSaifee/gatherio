import { and, asc, desc, eq } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import type { RecipientSession } from '@/db/party-session';
import { isStoredAnswer, type StoredAnswer } from './answer';

/**
 * The recipient page's one read path (Stage 6). Every query is filtered
 * by `session.caseId` from the start — `requirement`, then `assignment`
 * joined by requirement id *and* party id, then everything hanging off
 * that assignment's latest submission_version — so a row belonging to a
 * different case can never enter the result set. That's the
 * "requirement.caseId === session.caseId on every row" check the token
 * model requires (a token grants one case, not the workspace), made true
 * by construction rather than by a runtime assertion after the fact.
 *
 * N+1 by requirement, matching the existing listCases/listTemplates
 * precedent in this codebase (CHECKLIST: deliberate, fine at this
 * product's target scale) — a single flat join would fan out across
 * however many submission_version rows an assignment has accumulated and
 * need the same de-duplication in application code anyway.
 */

export interface RecipientLatestSubmission {
  submissionVersion: typeof schema.submissionVersion.$inferSelect;
  fileAsset: typeof schema.fileAsset.$inferSelect | null;
  answer: StoredAnswer | null;
}

export interface RecipientRequirementItem {
  requirement: typeof schema.requirement.$inferSelect;
  assignment: typeof schema.assignment.$inferSelect;
  latestSubmission: RecipientLatestSubmission | null;
  latestReview: typeof schema.review.$inferSelect | null;
}

export interface RecipientView {
  case: typeof schema.caseTable.$inferSelect;
  party: typeof schema.party.$inferSelect;
  items: RecipientRequirementItem[];
}

export async function getRecipientView(session: RecipientSession): Promise<RecipientView | null> {
  const s = scoped(session.workspaceId);

  const [caseRow] = await s.db
    .select()
    .from(schema.caseTable)
    .where(s.where(schema.caseTable.workspaceId, eq(schema.caseTable.id, session.caseId)))
    .limit(1);
  if (!caseRow) return null;

  const [party] = await s.db
    .select()
    .from(schema.party)
    .where(s.where(schema.party.workspaceId, eq(schema.party.id, session.partyId)))
    .limit(1);
  if (!party) return null;

  const requirements = await s.db
    .select()
    .from(schema.requirement)
    .where(s.where(schema.requirement.workspaceId, eq(schema.requirement.caseId, session.caseId)))
    .orderBy(asc(schema.requirement.sequence));

  const items: RecipientRequirementItem[] = [];

  for (const requirement of requirements) {
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(
        s.where(
          schema.assignment.workspaceId,
          and(
            eq(schema.assignment.requirementId, requirement.id),
            eq(schema.assignment.partyId, session.partyId),
          ),
        ),
      )
      .limit(1);

    // Not expected in Phase 1a's single-party model, but a token names a
    // party as well as a case — never assume every requirement has an
    // assignment for THIS party rather than checking.
    if (!assignment) continue;

    const [latestVersion] = await s.db
      .select()
      .from(schema.submissionVersion)
      .where(
        s.where(
          schema.submissionVersion.workspaceId,
          eq(schema.submissionVersion.assignmentId, assignment.id),
        ),
      )
      .orderBy(desc(schema.submissionVersion.versionNumber))
      .limit(1);

    let latestSubmission: RecipientLatestSubmission | null = null;
    let latestReview: RecipientRequirementItem['latestReview'] = null;

    if (latestVersion) {
      const [fileAsset] = await s.db
        .select()
        .from(schema.fileAsset)
        .where(
          s.where(
            schema.fileAsset.workspaceId,
            eq(schema.fileAsset.submissionVersionId, latestVersion.id),
          ),
        )
        .limit(1);

      const [answerRow] = await s.db
        .select()
        .from(schema.submissionAnswer)
        .where(
          s.where(
            schema.submissionAnswer.workspaceId,
            eq(schema.submissionAnswer.submissionVersionId, latestVersion.id),
          ),
        )
        .limit(1);

      latestSubmission = {
        submissionVersion: latestVersion,
        fileAsset: fileAsset ?? null,
        answer: answerRow && isStoredAnswer(answerRow.value) ? answerRow.value : null,
      };

      // Nothing writes `review` rows until Stage 7, and there's no more
      // than one expected per submission_version in practice — ordering
      // by reviewedAt (nullable) is a placeholder Stage 7 should revisit
      // once a version can genuinely accumulate more than one.
      const [reviewRow] = await s.db
        .select()
        .from(schema.review)
        .where(
          s.where(schema.review.workspaceId, eq(schema.review.submissionVersionId, latestVersion.id)),
        )
        .orderBy(desc(schema.review.reviewedAt))
        .limit(1);
      latestReview = reviewRow ?? null;
    }

    items.push({ requirement, assignment, latestSubmission, latestReview });
  }

  return { case: caseRow, party, items };
}

export interface AssignmentRequirement {
  requirementId: string;
  actionType: typeof schema.requirement.$inferSelect.actionType;
  answerFieldType: typeof schema.requirement.$inferSelect.answerFieldType;
  required: boolean;
  options: string[] | null;
  title: string;
  instructions: string | null;
  acceptanceCriteria: string | null;
}

/**
 * The requirement behind one assignment, resolved FROM the assignment
 * rather than from a separately client-supplied requirementId — every
 * write action derives what's being answered from an assignmentId
 * that's already been checked against the session's case and party, so
 * there's nothing here for a forged requirementId to bypass.
 */
export async function getRequirementForAssignment(
  workspaceId: WorkspaceId,
  params: { assignmentId: string; partyId: string; caseId: string },
): Promise<AssignmentRequirement | null> {
  const s = scoped(workspaceId);

  const [row] = await s.db
    .select({ requirement: schema.requirement })
    .from(schema.assignment)
    .innerJoin(schema.requirement, eq(schema.assignment.requirementId, schema.requirement.id))
    .where(
      s.where(
        schema.assignment.workspaceId,
        and(
          eq(schema.assignment.id, params.assignmentId),
          eq(schema.assignment.partyId, params.partyId),
          eq(schema.requirement.caseId, params.caseId),
        ),
      ),
    )
    .limit(1);
  if (!row) return null;

  const r = row.requirement;
  return {
    requirementId: r.id,
    actionType: r.actionType,
    answerFieldType: r.answerFieldType,
    required: r.required,
    options: r.options,
    title: r.title,
    instructions: r.instructions,
    acceptanceCriteria: r.acceptanceCriteria,
  };
}
