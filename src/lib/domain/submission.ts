import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, max, notExists } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import { withAudit, type Tx } from '@/db/audit';
import { env } from '@/lib/env';
import { getStorageAdapter } from '@/lib/adapters/storage';
import { getScanAdapter } from '@/lib/adapters/scan';
import type { UploadTicketPayload } from '@/lib/upload-ticket';
import type { AnswerValue, StoredAnswer } from './answer';
import { isOpenFulfilmentStatus, syncCaseCompletion } from './case-status';
import { latestCompletedVersion } from './submission-history';

/**
 * All of the recipient page's write paths (Stage 6/7) — everything that
 * mutates an assignment or creates a submission_version. Deliberately
 * kept separate from recipient-view.ts, which is read-only: "view" reads
 * the case, "submission" is every way it changes.
 */

export interface RecipientActor {
  partyId: string;
  caseId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Thrown by every recipient write path when the assignment is no longer
 * open (Stage 7, decision 5) — it's `submitted` awaiting review, or
 * already `accepted`. Only a requester reopening it (src/lib/domain/
 * review.ts) unlocks it again. One shared message: the recipient actions
 * surface `err.message` directly, so this is what the recipient sees.
 */
export class AssignmentClosedError extends Error {
  constructor() {
    super('This item has already been received — refresh the page to see its current status.');
    this.name = 'AssignmentClosedError';
  }
}

/**
 * Idempotent — safe to call on every page load. Only the first call that
 * actually flips a `pending` assignment to `viewed` writes an audit
 * event; a scanner that never runs this (it has no JS) or a recipient
 * reopening an already-viewed case produces zero additional writes.
 */
export async function markCaseViewed(workspaceId: WorkspaceId, actor: RecipientActor): Promise<void> {
  const s = scoped(workspaceId);

  await s.db.transaction(async (tx) => {
    const requirementRows = await tx
      .select({ id: schema.requirement.id })
      .from(schema.requirement)
      .where(s.where(schema.requirement.workspaceId, eq(schema.requirement.caseId, actor.caseId)));
    const requirementIds = requirementRows.map((r) => r.id);
    if (requirementIds.length === 0) return;

    const updated = await tx
      .update(schema.assignment)
      .set({ fulfilmentStatus: 'viewed', viewedAt: new Date() })
      .where(
        s.where(
          schema.assignment.workspaceId,
          and(
            eq(schema.assignment.partyId, actor.partyId),
            eq(schema.assignment.fulfilmentStatus, 'pending'),
            isNull(schema.assignment.viewedAt),
            inArray(schema.assignment.requirementId, requirementIds),
          ),
        ),
      )
      .returning({ id: schema.assignment.id });

    if (updated.length === 0) return;

    await withAudit(tx, {
      workspaceId,
      caseId: actor.caseId,
      actorType: 'party',
      actorId: actor.partyId,
      eventType: 'case.viewed',
      objectType: 'case',
      objectId: actor.caseId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { assignmentsMarked: updated.length },
    });
  });
}

export interface SaveDraftAnswerInput extends RecipientActor {
  assignmentId: string;
  actionType: 'upload' | 'answer' | 'acknowledge';
  /** Raw, not-yet-validated client value — a draft may be partial. */
  value: unknown;
}

/**
 * Audits assignment.started only the first time a draft promotes the
 * assignment out of pending/viewed — never on every blur.
 *
 * Locked (Stage 7): reads the assignment `FOR UPDATE` and never writes
 * back the fulfilment status it read — only ever promotes out of
 * pending/viewed, never touches it otherwise. The earlier version read
 * unlocked and wrote back `assignment.fulfilmentStatus`, which could lose
 * a concurrent requester decision (draft-save races an approve-as-is,
 * writes back the stale `in_progress` it read, and silently reopens an
 * item a requester just approved).
 *
 * On a closed assignment (submitted, awaiting review, or approved) this
 * is a silent no-op, not a thrown error: `AnswerField` fires it on every
 * blur and discards the result, so an error here would never reach the
 * recipient and would only be a pointless rejected promise.
 */
export async function saveDraftAnswer(
  workspaceId: WorkspaceId,
  input: SaveDraftAnswerInput,
): Promise<void> {
  const s = scoped(workspaceId);

  await s.db.transaction(async (tx) => {
    const assignment = await findCaseAssignmentForUpdate(tx, workspaceId, input);
    if (!assignment) throw new Error('Assignment not found.');
    if (!isOpenFulfilmentStatus(assignment.fulfilmentStatus)) return;

    const wasUnstarted =
      assignment.fulfilmentStatus === 'pending' || assignment.fulfilmentStatus === 'viewed';

    await tx
      .update(schema.assignment)
      .set({
        draftValue: input.value,
        draftUpdatedAt: new Date(),
        ...(wasUnstarted ? { fulfilmentStatus: 'in_progress' as const } : {}),
      })
      .where(eq(schema.assignment.id, assignment.id));

    if (wasUnstarted) {
      await withAudit(tx, {
        workspaceId,
        caseId: input.caseId,
        actorType: 'party',
        actorId: input.partyId,
        eventType: 'assignment.started',
        objectType: 'assignment',
        objectId: assignment.id,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { actionType: input.actionType },
      });
    }
  });
}

export interface RecordAnswerSubmissionInput extends RecipientActor {
  assignmentId: string;
  actionType: 'upload' | 'answer' | 'acknowledge';
  /** Already validated by src/lib/domain/answer.ts's validateAnswer — this function trusts it. */
  value: AnswerValue;
}

export interface RecordAnswerSubmissionResult {
  submissionVersionId: string;
  versionNumber: number;
}

/**
 * The write path for a text/date/choice/yes-no answer, an acknowledgement,
 * or a "this doesn't apply" declaration — all three just differ in which
 * AnswerValue variant is passed in. Never overwrites: always a new
 * submission_version, never a mutation of a prior one (§5, §4.3).
 *
 * Stage 7: throws AssignmentClosedError on a closed assignment (decision
 * 5) — an approved or awaiting-review item can no longer be silently
 * replaced by a second submit. Sets supersedesSubmissionId to whatever
 * was the latest completed version before this one (decision 6), and
 * syncs case completion last (a late optional answer can complete or
 * reopen a case).
 */
export async function recordAnswerSubmission(
  workspaceId: WorkspaceId,
  input: RecordAnswerSubmissionInput,
): Promise<RecordAnswerSubmissionResult> {
  const s = scoped(workspaceId);

  return s.db.transaction(async (tx) => {
    const assignment = await findCaseAssignmentForUpdate(tx, workspaceId, input);
    if (!assignment) throw new Error('Assignment not found.');
    if (!isOpenFulfilmentStatus(assignment.fulfilmentStatus)) throw new AssignmentClosedError();

    const previous = await latestCompletedVersion(tx, workspaceId, assignment.id);
    const versionNumber = await nextVersionNumber(tx, assignment.id);

    const [submissionVersion] = await tx
      .insert(schema.submissionVersion)
      .values({
        workspaceId,
        assignmentId: assignment.id,
        versionNumber,
        submittedByPartyId: input.partyId,
        supersedesSubmissionId: previous?.submissionVersion.id ?? null,
      })
      .returning();
    if (!submissionVersion) throw new Error('Failed to create submission version.');

    const storedAnswer: StoredAnswer = {
      ...input.value,
      // Derived from the already-authorized assignment row, never a
      // client-supplied requirementId — a mismatched value here would
      // misrepresent which requirement was actually answered even
      // though the assignment being mutated was correctly authorized.
      requirementId: assignment.requirementId,
      answeredAt: new Date().toISOString(),
    };

    await tx.insert(schema.submissionAnswer).values({
      workspaceId,
      submissionVersionId: submissionVersion.id,
      value: storedAnswer,
    });

    await tx
      .update(schema.assignment)
      .set({
        draftValue: null,
        draftUpdatedAt: null,
        fulfilmentStatus: 'submitted',
        submittedAt: new Date(),
      })
      .where(eq(schema.assignment.id, assignment.id));

    await withAudit(tx, {
      workspaceId,
      caseId: input.caseId,
      actorType: 'party',
      actorId: input.partyId,
      eventType: 'assignment.submitted',
      objectType: 'assignment',
      objectId: assignment.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        submissionVersionId: submissionVersion.id,
        versionNumber,
        actionType: input.actionType,
        supersedesSubmissionId: previous?.submissionVersion.id ?? null,
      },
    });

    await syncCaseCompletion(
      tx,
      workspaceId,
      input.caseId,
      { actorType: 'party', actorId: input.partyId },
      'assignment.submitted',
    );

    return { submissionVersionId: submissionVersion.id, versionNumber };
  });
}

export interface ReserveSubmissionVersionInput extends RecipientActor {
  assignmentId: string;
  originalFilename: string;
  contentType: string;
  declaredBytes: number;
}

export interface ReservedSubmissionVersion {
  submissionVersionId: string;
  /** {workspace_id}/{case_id}/{submission_version_id}/{uuid} (techstack.md) — never the original filename. */
  key: string;
}

/**
 * Reserves a submission_version before any bytes exist, purely so the
 * storage key (which is fixed to include the submission_version id) can
 * be built. Costs orphan versions and version-number gaps if the upload
 * is abandoned before confirmUploadAction runs — accepted per the
 * Stage 6 plan; the alternative (an "incoming/" staging prefix) would
 * break the mandated key format instead.
 *
 * Stage 7: throws AssignmentClosedError on a closed assignment (decision
 * 5) — a reservation is the first step of a replacement upload, so it's
 * gated the same way a direct submit is. `supersedesSubmissionId` is
 * deliberately NOT set here: a bare reservation isn't a submission until
 * finalizeUpload's locked transaction commits one (decision 6), so
 * setting it now against "whatever's latest at reservation time" could
 * point at a version that's since been superseded by something else.
 */
export async function reserveSubmissionVersion(
  workspaceId: WorkspaceId,
  input: ReserveSubmissionVersionInput,
): Promise<ReservedSubmissionVersion> {
  const s = scoped(workspaceId);

  return s.db.transaction(async (tx) => {
    const assignment = await findCaseAssignmentForUpdate(tx, workspaceId, input);
    if (!assignment) throw new Error('Assignment not found.');
    if (!isOpenFulfilmentStatus(assignment.fulfilmentStatus)) throw new AssignmentClosedError();

    const versionNumber = await nextVersionNumber(tx, assignment.id);

    const [submissionVersion] = await tx
      .insert(schema.submissionVersion)
      .values({
        workspaceId,
        assignmentId: assignment.id,
        versionNumber,
        submittedByPartyId: input.partyId,
      })
      .returning();
    if (!submissionVersion) throw new Error('Failed to reserve submission version.');

    const key = `${workspaceId}/${input.caseId}/${submissionVersion.id}/${randomUUID()}`;

    if (assignment.fulfilmentStatus === 'pending' || assignment.fulfilmentStatus === 'viewed') {
      await tx
        .update(schema.assignment)
        .set({ fulfilmentStatus: 'in_progress' })
        .where(eq(schema.assignment.id, assignment.id));
    }

    await withAudit(tx, {
      workspaceId,
      caseId: input.caseId,
      actorType: 'party',
      actorId: input.partyId,
      eventType: 'submission.upload_requested',
      objectType: 'submission_version',
      objectId: submissionVersion.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        key,
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        declaredBytes: input.declaredBytes,
      },
    });

    return { submissionVersionId: submissionVersion.id, key };
  });
}

export interface FinalizeUploadInput extends RecipientActor {
  ticket: UploadTicketPayload;
}

export type FinalizeUploadResult =
  | { ok: true; fileAssetId: string }
  | { ok: false; reason: 'too_large' | 'infected' | 'not_found' | 'closed' };

type FinalizeOutcome =
  | { kind: 'not_found' }
  | { kind: 'rejected' }
  | { kind: 'ok'; fileAssetId: string };

/**
 * Runs after the client reports the upload finished. Measures the object
 * itself (never trusts the client's declared size or type — the R2
 * driver ignores maxBytes at presign time, so this is the only place a
 * size cap is enforceable), scans it, and either records a clean
 * file_asset or discards the reservation. The scan runs inline here
 * rather than as a queued job (the noop driver returns instantly and
 * Playwright has no worker running) — Stage 8 lifts the scan.scan() +
 * discard/finalize logic into a pg-boss job as a call-site change.
 *
 * Stage 7 control flow, in order:
 *  1. Unlocked lookup — resolves case/party/assignment and whether this
 *     ticket was *already* finalized (a file_asset already exists for
 *     it). A replayed confirm of an already-finalized ticket returns ok
 *     and touches nothing else — it must never reach the discard path,
 *     which would otherwise delete a completed submission out from under
 *     a review that may already exist on it.
 *  2. Measure and scan the object, outside any transaction (unchanged
 *     from Stage 6). too_large/infected discard immediately and return.
 *  3. One locked transaction makes the real accept/reject decision: lock
 *     the assignment, re-check for a file_asset (closing the race between
 *     step 1's unlocked read and this lock — two concurrent confirms of
 *     the same ticket), then check whether the assignment is still open.
 *     Closed → discard and return rejected; this branch *commits* (a
 *     rejected upload is a normal outcome, not a failure). Open → set
 *     supersedesSubmissionId to whatever was latest before this version
 *     completes (decision 6), insert the file_asset, mark the assignment
 *     submitted, write the three existing audits, and sync case
 *     completion last.
 *  4. Only once that transaction has committed does a rejection's storage
 *     object get deleted — never before, so nothing can delete bytes a
 *     transaction then fails to actually discard.
 */
export async function finalizeUpload(
  workspaceId: WorkspaceId,
  input: FinalizeUploadInput,
): Promise<FinalizeUploadResult> {
  const s = scoped(workspaceId);
  const { ticket } = input;

  const [reserved] = await s.db
    .select({
      assignmentId: schema.assignment.id,
      caseId: schema.requirement.caseId,
      partyId: schema.assignment.partyId,
      fileAssetId: schema.fileAsset.id,
    })
    .from(schema.submissionVersion)
    .innerJoin(schema.assignment, eq(schema.submissionVersion.assignmentId, schema.assignment.id))
    .innerJoin(schema.requirement, eq(schema.assignment.requirementId, schema.requirement.id))
    .leftJoin(
      schema.fileAsset,
      eq(schema.fileAsset.submissionVersionId, schema.submissionVersion.id),
    )
    .where(
      s.where(
        schema.submissionVersion.workspaceId,
        eq(schema.submissionVersion.id, ticket.submissionVersionId),
      ),
    )
    .limit(1);

  if (!reserved || reserved.caseId !== input.caseId || reserved.partyId !== input.partyId) {
    return { ok: false, reason: 'not_found' };
  }
  if (reserved.fileAssetId) {
    // Already finalized — a replayed confirm. Never discard a completed submission.
    return { ok: true, fileAssetId: reserved.fileAssetId };
  }

  const storage = await getStorageAdapter();
  const completed = await storage.complete(ticket.key);

  if (completed.byteSize > ticket.maxBytes) {
    await storage.delete(ticket.key);
    await s.db.transaction((tx) =>
      discardReservedSubmissionTx(tx, workspaceId, ticket.submissionVersionId, input, {
        eventType: 'submission.upload_rejected',
        metadata: {
          key: ticket.key,
          reason: 'too_large',
          byteSize: completed.byteSize,
          maxBytes: ticket.maxBytes,
        },
      }),
    );
    return { ok: false, reason: 'too_large' };
  }

  const scanner = await getScanAdapter();
  const scanResult = await scanner.scan({ key: ticket.key });

  if (scanResult.outcome === 'infected') {
    await storage.delete(ticket.key);
    await s.db.transaction((tx) =>
      discardReservedSubmissionTx(tx, workspaceId, ticket.submissionVersionId, input, {
        eventType: 'file.scan_rejected',
        metadata: { key: ticket.key, outcome: 'infected', details: scanResult.details },
      }),
    );
    return { ok: false, reason: 'infected' };
  }

  const outcome: FinalizeOutcome = await s.db.transaction(async (tx) => {
    const [assignmentRow] = await tx
      .select()
      .from(schema.assignment)
      .where(
        s.where(schema.assignment.workspaceId, eq(schema.assignment.id, reserved.assignmentId)),
      )
      .limit(1)
      .for('no key update', { of: schema.assignment });
    if (!assignmentRow) return { kind: 'not_found' };

    const [existingFileAsset] = await tx
      .select({ id: schema.fileAsset.id })
      .from(schema.fileAsset)
      .where(
        s.where(
          schema.fileAsset.workspaceId,
          eq(schema.fileAsset.submissionVersionId, ticket.submissionVersionId),
        ),
      )
      .limit(1);
    if (existingFileAsset) {
      // Lost a replay race between the unlocked lookup above and this lock.
      return { kind: 'ok', fileAssetId: existingFileAsset.id };
    }

    if (!isOpenFulfilmentStatus(assignmentRow.fulfilmentStatus)) {
      await discardReservedSubmissionTx(tx, workspaceId, ticket.submissionVersionId, input, {
        eventType: 'submission.upload_rejected',
        metadata: { key: ticket.key, reason: 'assignment_closed' },
      });
      return { kind: 'rejected' };
    }

    const previous = await latestCompletedVersion(tx, workspaceId, assignmentRow.id);

    await tx
      .update(schema.submissionVersion)
      .set({ supersedesSubmissionId: previous?.submissionVersion.id ?? null })
      .where(eq(schema.submissionVersion.id, ticket.submissionVersionId));

    const [fileAsset] = await tx
      .insert(schema.fileAsset)
      .values({
        workspaceId,
        submissionVersionId: ticket.submissionVersionId,
        storageKey: ticket.key,
        originalFilename: ticket.originalFilename,
        mimeType: completed.contentType ?? ticket.contentType,
        byteSize: completed.byteSize,
        sha256Hash: completed.sha256,
        malwareScanStatus: 'clean',
      })
      .returning();
    if (!fileAsset) throw new Error('Failed to record uploaded file.');

    await tx
      .update(schema.assignment)
      .set({
        fulfilmentStatus: 'submitted',
        submittedAt: new Date(),
        draftValue: null,
        draftUpdatedAt: null,
      })
      .where(eq(schema.assignment.id, assignmentRow.id));

    await withAudit(tx, {
      workspaceId,
      caseId: input.caseId,
      actorType: 'system',
      eventType: 'file.scan_completed',
      objectType: 'file_asset',
      objectId: fileAsset.id,
      metadata: { outcome: scanResult.outcome, driver: env.SCAN_DRIVER },
    });

    await withAudit(tx, {
      workspaceId,
      caseId: input.caseId,
      actorType: 'party',
      actorId: input.partyId,
      eventType: 'submission.upload_confirmed',
      objectType: 'submission_version',
      objectId: ticket.submissionVersionId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        fileAssetId: fileAsset.id,
        byteSize: completed.byteSize,
        mimeType: fileAsset.mimeType,
        sha256: completed.sha256,
      },
    });

    await withAudit(tx, {
      workspaceId,
      caseId: input.caseId,
      actorType: 'party',
      actorId: input.partyId,
      eventType: 'assignment.submitted',
      objectType: 'assignment',
      objectId: assignmentRow.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        submissionVersionId: ticket.submissionVersionId,
        actionType: 'upload',
        supersedesSubmissionId: previous?.submissionVersion.id ?? null,
      },
    });

    await syncCaseCompletion(
      tx,
      workspaceId,
      input.caseId,
      { actorType: 'party', actorId: input.partyId },
      'submission.upload_confirmed',
    );

    return { kind: 'ok', fileAssetId: fileAsset.id };
  });

  if (outcome.kind === 'not_found') return { ok: false, reason: 'not_found' };
  if (outcome.kind === 'rejected') {
    try {
      await storage.delete(ticket.key);
    } catch (err) {
      console.error('finalizeUpload: failed to delete storage object for a rejected upload', err);
    }
    return { ok: false, reason: 'closed' };
  }
  return { ok: true, fileAssetId: outcome.fileAssetId };
}

/**
 * The one place every write path resolves "does this assignment actually
 * belong to this case, for this party" — a token authorizes exactly one
 * case, and `assignment` has no case_id of its own, so this is a real
 * join to `requirement`, not an assumption. In Phase 1a's single-party
 * model, partyId alone would happen to be equivalent (a party belongs to
 * exactly one case), but relying on that coincidence would silently stop
 * being safe the moment Phase 1b's multi-party model lets a party's
 * assignments span more than it does today — so this checks caseId
 * explicitly rather than leaning on it.
 *
 * Locks with `no key update` rather than `for update` (Stage 7): every
 * `withAudit` write with a caseId takes `key share` on the case row via
 * its FK, and `syncCaseCompletion` (case-status.ts, called at the end of
 * every one of these transactions) takes a lock on the case itself. `for
 * update` conflicts with `key share`; `no key update` doesn't, so using
 * `no key update` consistently on every row this codebase locks under
 * concurrent recipient/requester writes is what keeps two of these
 * transactions from ever deadlocking each other. `of: schema.assignment`
 * keeps the lock off the joined `requirement` row, which nothing here
 * needs to write.
 */
async function findCaseAssignmentForUpdate(
  tx: Tx,
  workspaceId: WorkspaceId,
  params: { assignmentId: string; partyId: string; caseId: string },
): Promise<typeof schema.assignment.$inferSelect | undefined> {
  const [row] = await tx
    .select({ assignment: schema.assignment })
    .from(schema.assignment)
    .innerJoin(schema.requirement, eq(schema.assignment.requirementId, schema.requirement.id))
    .where(
      and(
        eq(schema.assignment.workspaceId, workspaceId),
        eq(schema.assignment.id, params.assignmentId),
        eq(schema.assignment.partyId, params.partyId),
        eq(schema.requirement.caseId, params.caseId),
      ),
    )
    .limit(1)
    .for('no key update', { of: schema.assignment });
  return row?.assignment;
}

async function nextVersionNumber(tx: Tx, assignmentId: string): Promise<number> {
  const [row] = await tx
    .select({ max: max(schema.submissionVersion.versionNumber) })
    .from(schema.submissionVersion)
    .where(eq(schema.submissionVersion.assignmentId, assignmentId));
  return (row?.max ?? 0) + 1;
}

/**
 * Deletes an abandoned reservation (too-large upload, infected scan, or a
 * closed assignment) and audits why. Takes an existing transaction handle
 * (Stage 7) rather than opening its own — the too_large/infected callers
 * wrap it in a fresh `s.db.transaction`, but finalizeUpload's
 * assignment-closed path calls it from inside the transaction that's
 * already holding the assignment lock, and opening a second connection
 * there would risk deadlocking against a lock the outer transaction is
 * still holding. The `NOT EXISTS(file_asset)` guard means this can never
 * delete a completed submission even if a future caller gets the ordering
 * wrong — belt-and-braces alongside finalizeUpload's own "already
 * finalized" check earlier in the flow.
 */
async function discardReservedSubmissionTx(
  tx: Tx,
  workspaceId: WorkspaceId,
  submissionVersionId: string,
  actor: RecipientActor,
  event: { eventType: string; metadata: Record<string, unknown> },
): Promise<void> {
  await tx.delete(schema.submissionVersion).where(
    and(
      eq(schema.submissionVersion.id, submissionVersionId),
      notExists(
        tx
          .select({ id: schema.fileAsset.id })
          .from(schema.fileAsset)
          .where(eq(schema.fileAsset.submissionVersionId, submissionVersionId)),
      ),
    ),
  );
  await withAudit(tx, {
    workspaceId,
    caseId: actor.caseId,
    actorType: 'system',
    eventType: event.eventType,
    objectType: 'submission_version',
    objectId: submissionVersionId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: event.metadata,
  });
}
