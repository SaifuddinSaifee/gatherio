/**
 * Case and item status are computed, never stored (Stage 7, decision 8).
 * `case.completed_at` is a *stamp* kept in sync with this derivation by
 * `syncCaseCompletion` below — reversal (approve → reopen) and a late
 * optional submission both mean completion is non-monotonic, so a column
 * that only ever moved from null to set would eventually lie.
 *
 * This module is split top-to-bottom pure-first: `deriveItemState` and
 * `deriveCaseStatus` take plain data and do no I/O, so they're unit-tested
 * without a database — the same shape as src/lib/domain/answer.ts and
 * recipient.ts. Everything below the pure section talks to Postgres.
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import { withAudit, type Tx } from '@/db/audit';
import type { Database } from '@/db/client';
import type { StoredAnswer } from './answer';
import { isCompletedVersion } from './submission-history';

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

export type FulfilmentStatus = typeof schema.assignment.$inferSelect.fulfilmentStatus;
export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

/** What the latest *completed* submission_version actually was — an uploaded file, or one of the stored-answer kinds. */
export type CompletedKind = StoredAnswer['fieldType'] | 'file';

export type ItemState =
  | 'awaiting_recipient'
  | 'changes_requested'
  | 'needs_review'
  | 'accepted'
  | 'rejected'
  | 'waived'
  | 'cancelled';

export interface ItemStateInput {
  fulfilmentStatus: FulfilmentStatus;
  /** null when the assignment has no completed submission_version yet. */
  latestKind: CompletedKind | null;
  /** The decision on the latest completed version, or null if it hasn't been reviewed. */
  latestReviewStatus: ReviewDecision | null;
}

const OPEN_FULFILMENT_STATUSES = new Set<FulfilmentStatus>(['pending', 'viewed', 'in_progress']);

/**
 * An assignment a recipient may still write to — not yet submitted, not
 * awaiting review, not approved. Exported so submission.ts's write-path
 * guards (decision 5) share this exact definition with the state
 * derivation above, rather than redeclaring the three statuses separately.
 */
export function isOpenFulfilmentStatus(status: FulfilmentStatus): boolean {
  return OPEN_FULFILMENT_STATUSES.has(status);
}

/**
 * Rules apply in order — the first match wins:
 *  1. `waived`/`cancelled` fulfilment is terminal and overrides everything else.
 *  2. A `changes_requested` decision on the latest version always shows as
 *     that, even if fulfilment somehow still reads as open — the decision is
 *     the more specific signal.
 *  3. No completed version yet, or fulfilment hasn't reached `submitted`:
 *     it's the recipient's move, regardless of what an older review said
 *     (an item can be reopened without a fresh review existing on it yet).
 *  4. An explicit `approved`/`rejected` decision on the latest version wins.
 *     `rejected` is unreachable in Stage 7 (nothing produces it) — this
 *     still handles it, and fails closed (it blocks, see deriveCaseStatus)
 *     rather than silently treating it as accepted.
 *  5. An acknowledgement is auto-accepted (Stage 7 decision 7) — it never
 *     goes through review.
 *  6. Anything else — a submitted upload, answer, or "doesn't apply"
 *     declaration with no decision yet — needs review.
 */
export function deriveItemState(input: ItemStateInput): ItemState {
  const { fulfilmentStatus, latestKind, latestReviewStatus } = input;

  if (fulfilmentStatus === 'waived' || fulfilmentStatus === 'cancelled') {
    return fulfilmentStatus;
  }
  if (latestReviewStatus === 'changes_requested') {
    return 'changes_requested';
  }
  if (latestKind === null || OPEN_FULFILMENT_STATUSES.has(fulfilmentStatus)) {
    return 'awaiting_recipient';
  }
  if (latestReviewStatus === 'approved') {
    return 'accepted';
  }
  if (latestReviewStatus === 'rejected') {
    return 'rejected';
  }
  if (latestKind === 'acknowledge') {
    return 'accepted';
  }
  return 'needs_review';
}

export interface CaseStatusItem {
  required: boolean;
  state: ItemState;
}

export interface CaseStatusCounts {
  /** Required items in the `accepted` state — the numerator of "3 of 5 accepted". */
  accepted: number;
  needsReview: number;
  changesRequested: number;
  awaitingRecipient: number;
  /** Total required items — the denominator of "3 of 5 accepted". */
  required: number;
}

export interface CaseStatusResult {
  status: 'complete' | 'needs_review' | 'awaiting_recipient';
  counts: CaseStatusCounts;
}

/**
 * An item blocks completion if it's `needs_review`, `changes_requested`, or
 * `rejected` — regardless of whether it's required, because a submitted
 * optional item still needs a decision once it exists — or if it's
 * required and still `awaiting_recipient`. An untouched optional item
 * never blocks.
 */
function blocksCompletion(item: CaseStatusItem): boolean {
  if (
    item.state === 'needs_review' ||
    item.state === 'changes_requested' ||
    item.state === 'rejected'
  ) {
    return true;
  }
  return item.required && item.state === 'awaiting_recipient';
}

/**
 * `needs_review` outranks `awaiting_recipient` at the case level: if
 * anything needs a decision, that's the requester's move and the case
 * shows as such even while other items are still with the recipient.
 * `complete` only when nothing blocks.
 */
export function deriveCaseStatus(items: CaseStatusItem[]): CaseStatusResult {
  const counts: CaseStatusCounts = {
    accepted: 0,
    needsReview: 0,
    changesRequested: 0,
    awaitingRecipient: 0,
    required: 0,
  };

  let anyNeedsReview = false;
  let anyBlocks = false;

  for (const item of items) {
    if (item.required) {
      counts.required += 1;
      if (item.state === 'accepted') counts.accepted += 1;
    }
    if (item.state === 'needs_review') counts.needsReview += 1;
    if (item.state === 'changes_requested') counts.changesRequested += 1;
    if (item.state === 'awaiting_recipient') counts.awaitingRecipient += 1;

    if (item.state === 'needs_review') anyNeedsReview = true;
    if (blocksCompletion(item)) anyBlocks = true;
  }

  const status: CaseStatusResult['status'] = !anyBlocks
    ? 'complete'
    : anyNeedsReview
      ? 'needs_review'
      : 'awaiting_recipient';

  return { status, counts };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

export type Executor = Database | Tx;

/** deriveCaseStatus over loaded inputs — the one mapping every caller holding `StatusInputItem`s shares. */
export function caseStatusFromInputs(inputs: readonly StatusInputItem[]): CaseStatusResult {
  return deriveCaseStatus(
    inputs.map((i) => ({
      required: i.required,
      state: deriveItemState({
        fulfilmentStatus: i.fulfilmentStatus,
        latestKind: i.latestKind,
        latestReviewStatus: i.latestReviewStatus,
      }),
    })),
  );
}

export interface StatusInputItem {
  caseId: string;
  requirementId: string;
  title: string;
  required: boolean;
  sequence: number;
  assignmentId: string;
  fulfilmentStatus: FulfilmentStatus;
  latestKind: CompletedKind | null;
  latestReviewStatus: ReviewDecision | null;
  latestReviewId: string | null;
  latestReviewReason: string | null;
}

/**
 * Loads everything `deriveItemState`/`deriveCaseStatus` need for one or
 * more cases in exactly three queries, regardless of how many cases are
 * asked for — the dashboard's listCases and syncCaseCompletion both need
 * this and neither can afford to be N+1 by case.
 */
export async function loadCaseStatusInputs(
  ex: Executor,
  workspaceId: WorkspaceId,
  caseIds: string[],
): Promise<StatusInputItem[]> {
  if (caseIds.length === 0) return [];
  const s = scoped(workspaceId);

  const items = await ex
    .select({
      caseId: schema.requirement.caseId,
      requirementId: schema.requirement.id,
      title: schema.requirement.title,
      required: schema.requirement.required,
      sequence: schema.requirement.sequence,
      assignmentId: schema.assignment.id,
      fulfilmentStatus: schema.assignment.fulfilmentStatus,
    })
    .from(schema.assignment)
    .innerJoin(schema.requirement, eq(schema.assignment.requirementId, schema.requirement.id))
    .where(
      s.where(schema.assignment.workspaceId, inArray(schema.requirement.caseId, caseIds)),
    );

  const assignmentIds = items.map((i) => i.assignmentId);

  const latestByAssignment = new Map<
    string,
    { submissionVersionId: string; kind: CompletedKind }
  >();
  if (assignmentIds.length > 0) {
    const rows = await ex
      .selectDistinctOn([schema.submissionVersion.assignmentId], {
        assignmentId: schema.submissionVersion.assignmentId,
        submissionVersionId: schema.submissionVersion.id,
        versionNumber: schema.submissionVersion.versionNumber,
        fileAssetId: schema.fileAsset.id,
        answerKind: sql<string | null>`${schema.submissionAnswer.value} ->> 'fieldType'`,
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
          and(inArray(schema.submissionVersion.assignmentId, assignmentIds), isCompletedVersion),
        ),
      )
      .orderBy(asc(schema.submissionVersion.assignmentId), desc(schema.submissionVersion.versionNumber));

    for (const row of rows) {
      const kind = (row.fileAssetId ? 'file' : row.answerKind) as CompletedKind | null;
      if (!kind) continue; // defensive — isCompletedVersion already guarantees one of these is set
      latestByAssignment.set(row.assignmentId, { submissionVersionId: row.submissionVersionId, kind });
    }
  }

  const versionIds = [...latestByAssignment.values()].map((v) => v.submissionVersionId);
  const reviewByVersion = new Map<
    string,
    { id: string; reviewStatus: ReviewDecision; reason: string | null }
  >();
  if (versionIds.length > 0) {
    const rows = await ex
      .selectDistinctOn([schema.review.submissionVersionId], {
        submissionVersionId: schema.review.submissionVersionId,
        id: schema.review.id,
        reviewNumber: schema.review.reviewNumber,
        reviewStatus: schema.review.reviewStatus,
        reason: schema.review.reason,
      })
      .from(schema.review)
      .where(
        s.where(schema.review.workspaceId, inArray(schema.review.submissionVersionId, versionIds)),
      )
      .orderBy(asc(schema.review.submissionVersionId), desc(schema.review.reviewNumber));

    for (const row of rows) {
      reviewByVersion.set(row.submissionVersionId, {
        id: row.id,
        reviewStatus: row.reviewStatus as ReviewDecision,
        reason: row.reason,
      });
    }
  }

  return items.map((item) => {
    const latest = latestByAssignment.get(item.assignmentId) ?? null;
    const review = latest ? (reviewByVersion.get(latest.submissionVersionId) ?? null) : null;
    return {
      caseId: item.caseId,
      requirementId: item.requirementId,
      title: item.title,
      required: item.required,
      sequence: item.sequence,
      assignmentId: item.assignmentId,
      fulfilmentStatus: item.fulfilmentStatus,
      latestKind: latest?.kind ?? null,
      latestReviewStatus: review?.reviewStatus ?? null,
      latestReviewId: review?.id ?? null,
      latestReviewReason: review?.reason ?? null,
    };
  });
}

export interface CaseStatusActor {
  actorType: 'user' | 'party' | 'system';
  actorId?: string;
}

/**
 * The single place `case.completed_at` is written. Locks the case row
 * last, with `no key update` rather than `for update` — every `withAudit`
 * insert with a caseId takes `key share` on the case via its FK, and `for
 * update` conflicts with `key share`, which would deadlock a concurrent
 * recipient submit against a requester review. Reads happen after the
 * lock is taken, so a concurrent transaction's just-committed change is
 * always visible before this decides whether to stamp or clear.
 */
export async function syncCaseCompletion(
  tx: Tx,
  workspaceId: WorkspaceId,
  caseId: string,
  actor: CaseStatusActor,
  trigger: string,
): Promise<void> {
  const s = scoped(workspaceId);

  await tx
    .select({ id: schema.caseTable.id })
    .from(schema.caseTable)
    .where(s.where(schema.caseTable.workspaceId, eq(schema.caseTable.id, caseId)))
    .for('no key update', { of: schema.caseTable });

  const [caseRow] = await tx
    .select({ completedAt: schema.caseTable.completedAt })
    .from(schema.caseTable)
    .where(s.where(schema.caseTable.workspaceId, eq(schema.caseTable.id, caseId)))
    .limit(1);
  if (!caseRow) return;

  const inputs = await loadCaseStatusInputs(tx, workspaceId, [caseId]);
  const { status, counts } = caseStatusFromInputs(inputs);

  const isComplete = status === 'complete';
  const wasComplete = caseRow.completedAt !== null;

  if (isComplete && !wasComplete) {
    await tx
      .update(schema.caseTable)
      .set({ completedAt: new Date() })
      .where(eq(schema.caseTable.id, caseId));
    await withAudit(tx, {
      workspaceId,
      caseId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      eventType: 'case.completed',
      objectType: 'case',
      objectId: caseId,
      metadata: { trigger, acceptedCount: counts.accepted },
    });
  } else if (!isComplete && wasComplete) {
    await tx
      .update(schema.caseTable)
      .set({ completedAt: null })
      .where(eq(schema.caseTable.id, caseId));
    await withAudit(tx, {
      workspaceId,
      caseId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      eventType: 'case.reopened',
      objectType: 'case',
      objectId: caseId,
      metadata: { trigger },
    });
  }
}

export interface OutstandingForReminder {
  assignmentId: string;
  requirementId: string;
  title: string;
  required: boolean;
  state: 'awaiting_recipient' | 'changes_requested';
  reason: string | null;
  reviewId: string | null;
}

/**
 * The recipient's-move items on one case — what the reminder copy names
 * and snapshots into reminder_dispatch.reason_snapshot (Stage 8.5 manual
 * sends, Stage 8's scheduler later).
 */
export async function listOutstandingForReminder(
  workspaceId: WorkspaceId,
  caseId: string,
): Promise<OutstandingForReminder[]> {
  const inputs = await loadCaseStatusInputs(scoped(workspaceId).db, workspaceId, [caseId]);
  return outstandingFromInputs(inputs);
}

/**
 * Pure half of `listOutstandingForReminder`, for callers that already
 * hold loaded status inputs (the dashboard's batched load, the reminder
 * send's locked transaction) — sorted by requirement sequence.
 */
export function outstandingFromInputs(
  inputs: readonly StatusInputItem[],
): OutstandingForReminder[] {
  const sorted = [...inputs].sort((a, b) => a.sequence - b.sequence);

  const outstanding: OutstandingForReminder[] = [];
  for (const item of sorted) {
    const state = deriveItemState({
      fulfilmentStatus: item.fulfilmentStatus,
      latestKind: item.latestKind,
      latestReviewStatus: item.latestReviewStatus,
    });
    if (state !== 'awaiting_recipient' && state !== 'changes_requested') continue;

    outstanding.push({
      assignmentId: item.assignmentId,
      requirementId: item.requirementId,
      title: item.title,
      required: item.required,
      state,
      reason: state === 'changes_requested' ? item.latestReviewReason : null,
      reviewId: state === 'changes_requested' ? item.latestReviewId : null,
    });
  }

  return outstanding;
}

// ---------------------------------------------------------------------------
// Stage 8.5: manual reminders — pure logic, shared by case.ts's dashboard
// (blockingItems, reminder eligibility) and reminder.ts's send path.
// Living here rather than in reminder.ts avoids a case.ts <-> reminder.ts
// import cycle, since case.ts needs these too.
// ---------------------------------------------------------------------------

const MAX_REMINDER_NOTE_LENGTH = 500;

export class ReminderNoteTooLongError extends Error {
  constructor(length: number) {
    super(`The note is ${length} characters — the limit is ${MAX_REMINDER_NOTE_LENGTH}.`);
    this.name = 'ReminderNoteTooLongError';
  }
}

/** Trims, collapses to null when empty, and normalizes line endings — never silently truncates. */
export function normalizeReminderNote(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) return null;
  if (normalized.length > MAX_REMINDER_NOTE_LENGTH) {
    throw new ReminderNoteTooLongError(normalized.length);
  }
  return normalized;
}

/**
 * A reminder only ever names what's still blocking the case from the
 * recipient's side (product.md: "reminded about only what remains") —
 * required items and anything sent back with changes requested. An
 * untouched *optional* item is left out; chasing it would undermine trust
 * that a reminder means something is actually needed. Stage 8's scheduler
 * reuses this unchanged.
 */
export function selectReminderItems(
  outstanding: readonly OutstandingForReminder[],
): OutstandingForReminder[] {
  return outstanding.filter((item) => item.required || item.state === 'changes_requested');
}

export type ReminderRefusalReason = 'complete' | 'nothing_outstanding' | 'no_email' | 'cooldown';

const REMINDER_REFUSAL_MESSAGE: Record<ReminderRefusalReason, string> = {
  complete: "This case is complete — there's nothing to remind them about.",
  nothing_outstanding: 'Nothing is waiting on the recipient right now.',
  no_email: 'This recipient has no email address on file.',
  cooldown: 'A reminder was already sent recently for this case.',
};

export class ReminderNotAllowedError extends Error {
  constructor(
    public readonly reason: ReminderRefusalReason,
    public readonly availableAt?: Date,
  ) {
    super(REMINDER_REFUSAL_MESSAGE[reason]);
    this.name = 'ReminderNotAllowedError';
  }
}

export type ReminderEligibility =
  | { ok: true }
  | { ok: false; reason: ReminderRefusalReason; availableAt?: Date };

export interface ReminderEligibilityInput {
  caseStatus: CaseStatusResult['status'];
  reminderItemCount: number;
  recipientEmail: string | null;
  /** The latest queued/sent reminder attempt on this case, or null if none. */
  lastReminderAt: Date | null;
  now: Date;
  cooldownMs: number;
}

/**
 * The one rule both the server refusal and the UI's disabled-state
 * message read — so they can't disagree (Stage 8.5 design decision 9).
 * Order matters: a complete case is refused as "complete" even if it
 * somehow has zero reminder items for another reason, and "no email" is
 * checked before the cooldown, since fixing the cooldown wouldn't help.
 */
export function reminderEligibility(input: ReminderEligibilityInput): ReminderEligibility {
  if (input.caseStatus === 'complete') return { ok: false, reason: 'complete' };
  if (input.reminderItemCount === 0) return { ok: false, reason: 'nothing_outstanding' };
  if (!input.recipientEmail) return { ok: false, reason: 'no_email' };
  if (input.lastReminderAt) {
    const availableAt = new Date(input.lastReminderAt.getTime() + input.cooldownMs);
    if (availableAt.getTime() > input.now.getTime()) {
      return { ok: false, reason: 'cooldown', availableAt };
    }
  }
  return { ok: true };
}
