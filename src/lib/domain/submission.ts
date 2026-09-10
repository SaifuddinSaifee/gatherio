import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { scoped, type WorkspaceId, type Scoped } from '@/db/scoped';
import * as schema from '@/db/schema';
import { withAudit } from '@/db/audit';
import type { Database } from '@/db/client';
import { env } from '@/lib/env';
import { getStorageAdapter } from '@/lib/adapters/storage';
import { getScanAdapter } from '@/lib/adapters/scan';
import type { UploadTicketPayload } from '@/lib/upload-ticket';
import type { AnswerValue, StoredAnswer } from './answer';

/** What db.transaction(async (tx) => ...) actually hands its callback — see audit.ts's Tx for why this can't be typed as `typeof db` (missing $client). */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * All of the recipient page's write paths (Stage 6) — everything that
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

/** Audits assignment.started only the first time a draft promotes the assignment out of pending/viewed — never on every blur. */
export async function saveDraftAnswer(
  workspaceId: WorkspaceId,
  input: SaveDraftAnswerInput,
): Promise<void> {
  const s = scoped(workspaceId);

  await s.db.transaction(async (tx) => {
    const assignment = await findCaseAssignment(tx, workspaceId, input);
    if (!assignment) throw new Error('Assignment not found.');

    const wasUnstarted =
      assignment.fulfilmentStatus === 'pending' || assignment.fulfilmentStatus === 'viewed';

    await tx
      .update(schema.assignment)
      .set({
        draftValue: input.value,
        draftUpdatedAt: new Date(),
        fulfilmentStatus: wasUnstarted ? 'in_progress' : assignment.fulfilmentStatus,
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
 */
export async function recordAnswerSubmission(
  workspaceId: WorkspaceId,
  input: RecordAnswerSubmissionInput,
): Promise<RecordAnswerSubmissionResult> {
  const s = scoped(workspaceId);

  return s.db.transaction(async (tx) => {
    const assignment = await findCaseAssignmentForUpdate(tx, workspaceId, input);
    if (!assignment) throw new Error('Assignment not found.');

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
      },
    });

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
 */
export async function reserveSubmissionVersion(
  workspaceId: WorkspaceId,
  input: ReserveSubmissionVersionInput,
): Promise<ReservedSubmissionVersion> {
  const s = scoped(workspaceId);

  return s.db.transaction(async (tx) => {
    const assignment = await findCaseAssignmentForUpdate(tx, workspaceId, input);
    if (!assignment) throw new Error('Assignment not found.');

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
  | { ok: false; reason: 'too_large' | 'infected' | 'not_found' };

/**
 * Runs after the client reports the upload finished. Measures the object
 * itself (never trusts the client's declared size or type — the R2
 * driver ignores maxBytes at presign time, so this is the only place a
 * size cap is enforceable), scans it, and either records a clean
 * file_asset or discards the reservation. The scan runs inline here
 * rather than as a queued job (the noop driver returns instantly and
 * Playwright has no worker running) — Stage 8 lifts the scan.scan() +
 * discard/finalize logic into a pg-boss job as a call-site change.
 */
export async function finalizeUpload(
  workspaceId: WorkspaceId,
  input: FinalizeUploadInput,
): Promise<FinalizeUploadResult> {
  const s = scoped(workspaceId);
  const { ticket } = input;

  const [reserved] = await s.db
    .select({ assignmentId: schema.assignment.id, caseId: schema.requirement.caseId })
    .from(schema.submissionVersion)
    .innerJoin(schema.assignment, eq(schema.submissionVersion.assignmentId, schema.assignment.id))
    .innerJoin(schema.requirement, eq(schema.assignment.requirementId, schema.requirement.id))
    .where(
      s.where(
        schema.submissionVersion.workspaceId,
        eq(schema.submissionVersion.id, ticket.submissionVersionId),
      ),
    )
    .limit(1);
  if (!reserved || reserved.caseId !== input.caseId) {
    return { ok: false, reason: 'not_found' };
  }

  const storage = await getStorageAdapter();
  const completed = await storage.complete(ticket.key);

  if (completed.byteSize > ticket.maxBytes) {
    await storage.delete(ticket.key);
    await discardReservedSubmission(s, ticket.submissionVersionId, input, {
      eventType: 'submission.upload_rejected',
      metadata: { key: ticket.key, reason: 'too_large', byteSize: completed.byteSize, maxBytes: ticket.maxBytes },
    });
    return { ok: false, reason: 'too_large' };
  }

  const scanner = await getScanAdapter();
  const scanResult = await scanner.scan({ key: ticket.key });

  if (scanResult.outcome === 'infected') {
    await storage.delete(ticket.key);
    await discardReservedSubmission(s, ticket.submissionVersionId, input, {
      eventType: 'file.scan_rejected',
      metadata: { key: ticket.key, outcome: 'infected', details: scanResult.details },
    });
    return { ok: false, reason: 'infected' };
  }

  const fileAssetId = await s.db.transaction(async (tx) => {
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
      .where(eq(schema.assignment.id, reserved.assignmentId));

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
      objectId: reserved.assignmentId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { submissionVersionId: ticket.submissionVersionId, actionType: 'upload' },
    });

    return fileAsset.id;
  });

  return { ok: true, fileAssetId };
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
 */
async function findCaseAssignment(
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
    .limit(1);
  return row?.assignment;
}

/** Same lookup as findCaseAssignment, but row-locked — for the two write paths that race on computing the next version_number. */
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
    .for('update');
  return row?.assignment;
}

async function nextVersionNumber(tx: Tx, assignmentId: string): Promise<number> {
  const [row] = await tx
    .select({ max: max(schema.submissionVersion.versionNumber) })
    .from(schema.submissionVersion)
    .where(eq(schema.submissionVersion.assignmentId, assignmentId));
  return (row?.max ?? 0) + 1;
}

/** Deletes an abandoned reservation (too-large or infected upload) and audits why. */
async function discardReservedSubmission(
  s: Scoped,
  submissionVersionId: string,
  actor: RecipientActor,
  event: { eventType: string; metadata: Record<string, unknown> },
): Promise<void> {
  await s.db.transaction(async (tx) => {
    await tx.delete(schema.submissionVersion).where(eq(schema.submissionVersion.id, submissionVersionId));
    await withAudit(tx, {
      workspaceId: s.workspaceId,
      caseId: actor.caseId,
      actorType: 'system',
      eventType: event.eventType,
      objectType: 'submission_version',
      objectId: submissionVersionId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: event.metadata,
    });
  });
}
