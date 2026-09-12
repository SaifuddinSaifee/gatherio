/**
 * The rework loop's decision layer (Stage 7) — a requester approves a
 * submission or requests changes on it. Both paths share one shape:
 * resolve and lock the assignment, confirm the target version is still
 * the assignment's latest *completed* one, compute the next
 * review_number under that lock (decision 2 — never trust reviewedAt to
 * order decisions), insert the decision (never mutate a prior one —
 * decision 1), move the assignment's fulfilment status (decision 3), and
 * sync case completion last (case-status.ts's locking rules).
 *
 * ACL chokepoint 5 (Stage 11's roles-and-tenancy.md): reviewing is
 * content access — "you cannot review what you cannot read." No role
 * check exists here yet; `can()` and `require_separate_reviewer` are
 * Stage 11 work, not invented early as a `requireRole` call this stage
 * would just have to migrate again.
 */

import { and, desc, eq } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import { withAudit } from '@/db/audit';
import { latestCompletedVersion } from './submission-history';
import { syncCaseCompletion } from './case-status';

export interface ReviewActor {
  caseId: string;
  submissionVersionId: string;
  /**
   * The highest review_number the reviewer's page showed when they
   * loaded it (0 if the version has never been reviewed). The
   * optimistic-concurrency token that makes two tabs, or two reviewers,
   * fail safely instead of silently overwriting each other's decision.
   */
  expectedReviewNumber: number;
  reviewerUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RequestChangesInput extends ReviewActor {
  reason: string;
}

export interface ReviewResult {
  reviewId: string;
  reviewNumber: number;
}

/**
 * One shared conflict error (decision 9) rather than separate types for
 * "wrong case", "not the latest version", "stale review_number", and "a
 * no-op decision" — all four collapse to the same user-facing fact: what
 * the reviewer is looking at is no longer current.
 */
export class ReviewConflictError extends Error {
  constructor(message = 'This item changed since you loaded the page — refresh and try again.') {
    super(message);
    this.name = 'ReviewConflictError';
  }
}

/** Acknowledgements are auto-accepted (decision 7) and never go through review — there's nothing to approve or reopen. */
export class ReviewNotRequiredError extends Error {
  constructor() {
    super('This item was accepted automatically and has no review decision to change.');
    this.name = 'ReviewNotRequiredError';
  }
}

export class InvalidReasonError extends Error {
  constructor() {
    super('Please describe what needs to change (1–1000 characters).');
    this.name = 'InvalidReasonError';
  }
}

async function performReview(
  workspaceId: WorkspaceId,
  input: ReviewActor,
  decision: 'approved' | 'changes_requested',
  reason: string | null,
): Promise<ReviewResult> {
  const s = scoped(workspaceId);

  return s.db.transaction(async (tx) => {
    // Step 1: resolve the version → assignment → requirement, with
    // caseId in the WHERE (the cross-case check a token model can't give
    // us for free), locked on the assignment.
    const [row] = await tx
      .select({ assignment: schema.assignment })
      .from(schema.submissionVersion)
      .innerJoin(schema.assignment, eq(schema.submissionVersion.assignmentId, schema.assignment.id))
      .innerJoin(schema.requirement, eq(schema.assignment.requirementId, schema.requirement.id))
      .where(
        s.where(
          schema.submissionVersion.workspaceId,
          and(
            eq(schema.submissionVersion.id, input.submissionVersionId),
            eq(schema.requirement.caseId, input.caseId),
          ),
        ),
      )
      .limit(1)
      .for('no key update', { of: schema.assignment });
    if (!row) {
      throw new ReviewConflictError('This item could not be found — refresh the page.');
    }

    // Step 2: freshness checks, in fresh statements taken under the lock
    // just acquired — a concurrent reviewer's commit is now visible.
    const latest = await latestCompletedVersion(tx, workspaceId, row.assignment.id);
    if (!latest || latest.submissionVersion.id !== input.submissionVersionId) {
      throw new ReviewConflictError();
    }
    if (latest.answer?.fieldType === 'acknowledge') {
      throw new ReviewNotRequiredError();
    }

    const [latestReview] = await tx
      .select({ reviewNumber: schema.review.reviewNumber, reviewStatus: schema.review.reviewStatus })
      .from(schema.review)
      .where(
        s.where(
          schema.review.workspaceId,
          eq(schema.review.submissionVersionId, input.submissionVersionId),
        ),
      )
      .orderBy(desc(schema.review.reviewNumber))
      .limit(1);

    const currentMax = latestReview?.reviewNumber ?? 0;
    if (currentMax !== input.expectedReviewNumber) {
      throw new ReviewConflictError();
    }
    if (latestReview?.reviewStatus === decision) {
      throw new ReviewConflictError('This decision has already been recorded.');
    }

    const reviewNumber = currentMax + 1;
    const [review] = await tx
      .insert(schema.review)
      .values({
        workspaceId,
        submissionVersionId: input.submissionVersionId,
        reviewNumber,
        reviewStatus: decision,
        reviewedBy: input.reviewerUserId,
        reason,
      })
      .returning();
    if (!review) throw new Error('Failed to record review decision.');

    // Decision 3: approve reopens nothing and clears any leftover draft
    // (defensive — a draft shouldn't exist alongside a completed
    // submission, but if decision 5's guard is ever raced, this stops it
    // leaking into a later reopen's prefill). Request-changes is the
    // concrete "reopens exactly one assignment".
    await tx
      .update(schema.assignment)
      .set(
        decision === 'approved'
          ? { fulfilmentStatus: 'submitted', draftValue: null, draftUpdatedAt: null }
          : { fulfilmentStatus: 'in_progress' },
      )
      .where(eq(schema.assignment.id, row.assignment.id));

    await withAudit(tx, {
      workspaceId,
      caseId: input.caseId,
      actorType: 'user',
      actorId: input.reviewerUserId,
      eventType: decision === 'approved' ? 'review.approved' : 'review.changes_requested',
      objectType: 'review',
      objectId: review.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        assignmentId: row.assignment.id,
        submissionVersionId: input.submissionVersionId,
        versionNumber: latest.submissionVersion.versionNumber,
        reviewNumber,
        previousStatus: latestReview?.reviewStatus ?? null,
        ...(decision === 'changes_requested' ? { reason } : {}),
      },
    });

    await syncCaseCompletion(
      tx,
      workspaceId,
      input.caseId,
      { actorType: 'user', actorId: input.reviewerUserId },
      decision === 'approved' ? 'review.approved' : 'review.changes_requested',
    );

    return { reviewId: review.id, reviewNumber };
  });
}

/** Also serves "approve as-is" — approving a version whose latest decision was `changes_requested`. */
export async function approveSubmission(
  workspaceId: WorkspaceId,
  input: ReviewActor,
): Promise<ReviewResult> {
  return performReview(workspaceId, input, 'approved', null);
}

/** Also serves "reopen" — requesting changes on a version whose latest decision was `approved`. */
export async function requestChanges(
  workspaceId: WorkspaceId,
  input: RequestChangesInput,
): Promise<ReviewResult> {
  const reason = input.reason.trim();
  if (reason.length < 1 || reason.length > 1000) throw new InvalidReasonError();
  return performReview(workspaceId, input, 'changes_requested', reason);
}
