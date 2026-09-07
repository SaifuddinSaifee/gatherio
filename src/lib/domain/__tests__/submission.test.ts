import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { scoped } from '@/db/scoped';
import * as schema from '@/db/schema';
import { seedFixtureCase, seedRecipientFixture } from '@/db/testing';
import { writeLocalFile } from '@/lib/adapters/storage.local';
import { getScanAdapter } from '@/lib/adapters/scan';
import {
  finalizeUpload,
  markCaseViewed,
  recordAnswerSubmission,
  reserveSubmissionVersion,
  saveDraftAnswer,
} from '../submission';

// Wrap the real (noop) scan adapter in a spy so most tests exercise the
// actual "always clean" driver, while the one infected-path test below
// can override its resolved value for that call only.
vi.mock('@/lib/adapters/scan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adapters/scan')>();
  return { ...actual, getScanAdapter: vi.fn(actual.getScanAdapter) };
});

async function auditEventsFor(workspaceId: Awaited<ReturnType<typeof seedRecipientFixture>>['workspaceId'], objectId: string) {
  const s = scoped(workspaceId);
  return s.db.select().from(schema.auditEvent).where(eq(schema.auditEvent.objectId, objectId));
}

describe('markCaseViewed', () => {
  it('marks every pending assignment as viewed and writes exactly one case.viewed audit event', async () => {
    const fixture = await seedRecipientFixture();

    await markCaseViewed(fixture.workspaceId, { partyId: fixture.partyId, caseId: fixture.caseId });

    const s = scoped(fixture.workspaceId);
    const assignments = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.partyId, fixture.partyId));
    for (const a of assignments) {
      expect(a.fulfilmentStatus).toBe('viewed');
      expect(a.viewedAt).not.toBeNull();
    }

    const events = await auditEventsFor(fixture.workspaceId, fixture.caseId);
    const viewedEvents = events.filter((e) => e.eventType === 'case.viewed');
    expect(viewedEvents).toHaveLength(1);
    expect(viewedEvents[0]?.metadata).toEqual({ assignmentsMarked: fixture.requirementIds.length });
  });

  it('is idempotent — a second call writes no additional audit event', async () => {
    const fixture = await seedRecipientFixture();
    const actor = { partyId: fixture.partyId, caseId: fixture.caseId };

    await markCaseViewed(fixture.workspaceId, actor);
    await markCaseViewed(fixture.workspaceId, actor); // the mail-scanner-style repeat GET

    const events = await auditEventsFor(fixture.workspaceId, fixture.caseId);
    expect(events.filter((e) => e.eventType === 'case.viewed')).toHaveLength(1);
  });
});

describe('saveDraftAnswer', () => {
  it('sets the draft value and promotes pending -> in_progress, auditing assignment.started once', async () => {
    const fixture = await seedRecipientFixture();
    const s = scoped(fixture.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, fixture.requirementIds[1]!));

    await saveDraftAnswer(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      actionType: 'answer',
      value: 'yes',
    });

    const [updated] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, assignment!.id));
    expect(updated?.fulfilmentStatus).toBe('in_progress');
    expect(updated?.draftValue).toBe('yes');
    expect(updated?.draftUpdatedAt).not.toBeNull();

    const events = await auditEventsFor(fixture.workspaceId, assignment!.id);
    expect(events.filter((e) => e.eventType === 'assignment.started')).toHaveLength(1);
  });

  it('updates the draft again without a second assignment.started audit once already in_progress', async () => {
    const fixture = await seedRecipientFixture();
    const s = scoped(fixture.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, fixture.requirementIds[1]!));

    const input = {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      actionType: 'answer' as const,
    };
    await saveDraftAnswer(fixture.workspaceId, { ...input, value: 'yes' });
    await saveDraftAnswer(fixture.workspaceId, { ...input, value: 'no' });

    const [updated] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, assignment!.id));
    expect(updated?.draftValue).toBe('no');

    const events = await auditEventsFor(fixture.workspaceId, assignment!.id);
    expect(events.filter((e) => e.eventType === 'assignment.started')).toHaveLength(1);
  });

  it('throws when the assignment belongs to a different case', async () => {
    const fixtureA = await seedRecipientFixture();
    const fixtureB = await seedFixtureCase({
      workspaceId: fixtureA.workspaceId,
      userId: fixtureA.userId,
    });

    await expect(
      saveDraftAnswer(fixtureA.workspaceId, {
        partyId: fixtureA.partyId, // fixture A's party
        caseId: fixtureA.caseId, // fixture A's case
        assignmentId: (
          await scoped(fixtureA.workspaceId)
            .db.select()
            .from(schema.assignment)
            .where(eq(schema.assignment.requirementId, fixtureB.requirementIds[0]!))
        )[0]!.id, // but fixture B's assignment
        actionType: 'answer',
        value: 'x',
      }),
    ).rejects.toThrow('Assignment not found.');
  });
});

describe('recordAnswerSubmission', () => {
  it('creates a submission_version + submission_answer and marks the assignment submitted', async () => {
    const fixture = await seedRecipientFixture();
    const s = scoped(fixture.workspaceId);
    const answerRequirementId = fixture.requirementIds[1]!;
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, answerRequirementId));

    const result = await recordAnswerSubmission(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      actionType: 'answer',
      value: { fieldType: 'yes_no', yes: true },
    });

    expect(result.versionNumber).toBe(1);

    const [updated] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, assignment!.id));
    expect(updated?.fulfilmentStatus).toBe('submitted');
    expect(updated?.submittedAt).not.toBeNull();

    const [answerRow] = await s.db
      .select()
      .from(schema.submissionAnswer)
      .where(eq(schema.submissionAnswer.submissionVersionId, result.submissionVersionId));
    expect(answerRow?.value).toMatchObject({ fieldType: 'yes_no', yes: true, requirementId: answerRequirementId });

    const events = await auditEventsFor(fixture.workspaceId, assignment!.id);
    expect(events.filter((e) => e.eventType === 'assignment.submitted')).toHaveLength(1);
  });

  it('resubmission creates version 2 without touching version 1', async () => {
    const fixture = await seedRecipientFixture();
    const s = scoped(fixture.workspaceId);
    const answerRequirementId = fixture.requirementIds[1]!;
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, answerRequirementId));

    const first = await recordAnswerSubmission(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      actionType: 'answer',
      value: { fieldType: 'yes_no', yes: true },
    });
    const second = await recordAnswerSubmission(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      actionType: 'answer',
      value: { fieldType: 'yes_no', yes: false },
    });

    expect(first.versionNumber).toBe(1);
    expect(second.versionNumber).toBe(2);
    expect(second.submissionVersionId).not.toBe(first.submissionVersionId);

    const versions = await s.db
      .select()
      .from(schema.submissionVersion)
      .where(eq(schema.submissionVersion.assignmentId, assignment!.id));
    expect(versions).toHaveLength(2);

    const [firstVersionUntouched] = versions.filter((v) => v.id === first.submissionVersionId);
    expect(firstVersionUntouched?.versionNumber).toBe(1);
  });

  it('rejects submitting against an assignment that belongs to a different case', async () => {
    const fixtureA = await seedRecipientFixture();
    const fixtureB = await seedFixtureCase({
      workspaceId: fixtureA.workspaceId,
      userId: fixtureA.userId,
    });
    const s = scoped(fixtureA.workspaceId);
    const [assignmentB] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, fixtureB.requirementIds[1]!));

    await expect(
      recordAnswerSubmission(fixtureA.workspaceId, {
        partyId: fixtureA.partyId, // fixture A's session
        caseId: fixtureA.caseId, // fixture A's session
        assignmentId: assignmentB!.id, // fixture B's assignment
        actionType: 'answer',
        value: { fieldType: 'yes_no', yes: true },
      }),
    ).rejects.toThrow('Assignment not found.');

    // Nothing was written for case B's assignment as a side effect of the attempt.
    const versions = await s.db
      .select()
      .from(schema.submissionVersion)
      .where(eq(schema.submissionVersion.assignmentId, assignmentB!.id));
    expect(versions).toHaveLength(0);
  });

  it('records a not_applicable declaration the same way as any other answer', async () => {
    const fixture = await seedRecipientFixture();
    const answerRequirementId = fixture.requirementIds[1]!;
    const s = scoped(fixture.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, answerRequirementId));

    await recordAnswerSubmission(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      actionType: 'answer',
      value: { fieldType: 'not_applicable', declaredBy: 'party' },
    });

    const [updated] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, assignment!.id));
    expect(updated?.fulfilmentStatus).toBe('submitted');
  });
});

describe('reserveSubmissionVersion + finalizeUpload', () => {
  it('completes the full upload flow: reserve, upload bytes, finalize as clean', async () => {
    const fixture = await seedRecipientFixture();
    const uploadRequirementId = fixture.requirementIds[0]!;
    const s = scoped(fixture.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, uploadRequirementId));

    const reserved = await reserveSubmissionVersion(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      originalFilename: 'statement.pdf',
      contentType: 'application/pdf',
      declaredBytes: 11,
    });

    expect(reserved.key).toBe(`${fixture.workspaceId}/${fixture.caseId}/${reserved.submissionVersionId}/${reserved.key.split('/').pop()}`);

    const [afterReserve] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, assignment!.id));
    expect(afterReserve?.fulfilmentStatus).toBe('in_progress');

    async function* body() {
      yield new TextEncoder().encode('hello world');
    }
    await writeLocalFile(reserved.key, body());

    const result = await finalizeUpload(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      ticket: {
        submissionVersionId: reserved.submissionVersionId,
        key: reserved.key,
        contentType: 'application/pdf',
        originalFilename: 'statement.pdf',
        maxBytes: 1_000_000,
        exp: Date.now() + 60_000,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');

    const [fileAsset] = await s.db
      .select()
      .from(schema.fileAsset)
      .where(eq(schema.fileAsset.id, result.fileAssetId));
    expect(fileAsset?.malwareScanStatus).toBe('clean');
    expect(fileAsset?.byteSize).toBe(Buffer.byteLength('hello world'));

    const [afterFinalize] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, assignment!.id));
    expect(afterFinalize?.fulfilmentStatus).toBe('submitted');

    const events = await auditEventsFor(fixture.workspaceId, reserved.submissionVersionId);
    const eventTypes = events.map((e) => e.eventType).sort();
    expect(eventTypes).toEqual(['submission.upload_confirmed', 'submission.upload_requested']);
  });

  it('rejects and discards the reservation when the uploaded file exceeds maxBytes', async () => {
    const fixture = await seedRecipientFixture();
    const s = scoped(fixture.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, fixture.requirementIds[0]!));

    const reserved = await reserveSubmissionVersion(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      originalFilename: 'big.pdf',
      contentType: 'application/pdf',
      declaredBytes: 5,
    });

    async function* body() {
      yield new TextEncoder().encode('this file is bigger than the limit');
    }
    await writeLocalFile(reserved.key, body());

    const result = await finalizeUpload(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      ticket: {
        submissionVersionId: reserved.submissionVersionId,
        key: reserved.key,
        contentType: 'application/pdf',
        originalFilename: 'big.pdf',
        maxBytes: 5, // smaller than the real uploaded size — enforced server-side, never trusting the client
        exp: Date.now() + 60_000,
      },
    });

    expect(result).toEqual({ ok: false, reason: 'too_large' });

    const versions = await s.db
      .select()
      .from(schema.submissionVersion)
      .where(eq(schema.submissionVersion.id, reserved.submissionVersionId));
    expect(versions).toHaveLength(0); // the reservation was discarded

    const events = await auditEventsFor(fixture.workspaceId, reserved.submissionVersionId);
    expect(events.map((e) => e.eventType).sort()).toEqual([
      'submission.upload_rejected',
      'submission.upload_requested',
    ]);
  });

  it('rejects and discards the reservation when the scan reports infected', async () => {
    vi.mocked(getScanAdapter).mockResolvedValueOnce({
      scan: async () => ({ outcome: 'infected', details: 'synthetic-test-signature' }),
    });

    const fixture = await seedRecipientFixture();
    const s = scoped(fixture.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, fixture.requirementIds[0]!));

    const reserved = await reserveSubmissionVersion(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      originalFilename: 'eicar.pdf',
      contentType: 'application/pdf',
      declaredBytes: 5,
    });

    async function* body() {
      yield new TextEncoder().encode('evil');
    }
    await writeLocalFile(reserved.key, body());

    const result = await finalizeUpload(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      ticket: {
        submissionVersionId: reserved.submissionVersionId,
        key: reserved.key,
        contentType: 'application/pdf',
        originalFilename: 'eicar.pdf',
        maxBytes: 1_000_000,
        exp: Date.now() + 60_000,
      },
    });

    expect(result).toEqual({ ok: false, reason: 'infected' });

    const versions = await s.db
      .select()
      .from(schema.submissionVersion)
      .where(eq(schema.submissionVersion.id, reserved.submissionVersionId));
    expect(versions).toHaveLength(0);

    const events = await auditEventsFor(fixture.workspaceId, reserved.submissionVersionId);
    const rejected = events.find((e) => e.eventType === 'file.scan_rejected');
    expect(rejected?.metadata).toMatchObject({ outcome: 'infected' });
  });

  it('two concurrent reservations on the same assignment never produce the same version number', async () => {
    const fixture = await seedRecipientFixture();
    const s = scoped(fixture.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, fixture.requirementIds[0]!));

    const input = {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      originalFilename: 'a.pdf',
      contentType: 'application/pdf',
      declaredBytes: 5,
    };

    const [a, b] = await Promise.allSettled([
      reserveSubmissionVersion(fixture.workspaceId, input),
      reserveSubmissionVersion(fixture.workspaceId, input),
    ]);

    // The row lock (`FOR UPDATE`) serializes the two transactions rather
    // than letting either fail — both should succeed with distinct,
    // sequential version numbers. Assert whichever shape actually
    // happens is internally consistent: no duplicate version numbers.
    const succeeded = [a, b].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof reserveSubmissionVersion>>
    >[];
    const versions = await s.db
      .select({ versionNumber: schema.submissionVersion.versionNumber })
      .from(schema.submissionVersion)
      .where(eq(schema.submissionVersion.assignmentId, assignment!.id));

    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    const versionNumbers = versions.map((v) => v.versionNumber);
    expect(new Set(versionNumbers).size).toBe(versionNumbers.length); // no duplicates
  });
});

describe('finalizeUpload — audit atomicity (CHECKLIST: "state change + audit event commit/rollback together")', () => {
  it('rolls back the file_asset insert and the assignment update when a later audit write in the same transaction fails', async () => {
    const fixture = await seedRecipientFixture();
    const s = scoped(fixture.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, fixture.requirementIds[0]!));

    const reserved = await reserveSubmissionVersion(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: assignment!.id,
      originalFilename: 'statement.pdf',
      contentType: 'application/pdf',
      declaredBytes: 11,
    });

    async function* body() {
      yield new TextEncoder().encode('hello world');
    }
    await writeLocalFile(reserved.key, body());

    // audit_event.ip_address is a pg `inet` column — a value that fails
    // that cast throws mid-transaction, after the file_asset insert and
    // the assignment update have already run inside the same tx. This is
    // exactly the scenario request-context.ts's clientIp() exists to
    // prevent in production; here it's injected directly to prove the
    // rollback guarantee rather than to test clientIp() again.
    await expect(
      finalizeUpload(fixture.workspaceId, {
        partyId: fixture.partyId,
        caseId: fixture.caseId,
        ipAddress: 'not-a-valid-ip-address',
        ticket: {
          submissionVersionId: reserved.submissionVersionId,
          key: reserved.key,
          contentType: 'application/pdf',
          originalFilename: 'statement.pdf',
          maxBytes: 1_000_000,
          exp: Date.now() + 60_000,
        },
      }),
    ).rejects.toThrow();

    const fileAssets = await s.db
      .select()
      .from(schema.fileAsset)
      .where(eq(schema.fileAsset.submissionVersionId, reserved.submissionVersionId));
    expect(fileAssets).toHaveLength(0); // the insert was rolled back

    const [afterFailure] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, assignment!.id));
    expect(afterFailure?.fulfilmentStatus).toBe('in_progress'); // still the reserve-time state, not 'submitted'

    // Only the reserve call's own (separately committed) audit row exists —
    // nothing from the failed finalize transaction landed.
    const events = await auditEventsFor(fixture.workspaceId, reserved.submissionVersionId);
    expect(events.map((e) => e.eventType)).toEqual(['submission.upload_requested']);
  });
});
