import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import { seedFixtureCase, seedRecipientFixture, type RecipientFixture } from '@/db/testing';
import { writeLocalFile } from '@/lib/adapters/storage.local';
import { finalizeUpload, recordAnswerSubmission, reserveSubmissionVersion } from '../submission';
import {
  approveSubmission,
  requestChanges,
  ReviewConflictError,
  ReviewNotRequiredError,
  InvalidReasonError,
} from '../review';
import { listOutstandingForReminder } from '../case-status';
import { getRecipientView } from '../recipient-view';
import type { RequirementDefinitionInput } from '../template';

/**
 * Upload + answer + acknowledge, one of each action type — every review
 * scenario in this file needs at least two, and the acknowledgement
 * cases need the third.
 */
const REVIEW_REQUIREMENTS: RequirementDefinitionInput[] = [
  {
    actionType: 'upload',
    answerFieldType: null,
    title: 'Bank statement',
    instructions: null,
    required: true,
    sequence: 0,
    acceptanceCriteria: null,
    sensitivity: 'general',
    options: null,
  },
  {
    actionType: 'answer',
    answerFieldType: 'yes_no',
    title: 'Any new loans this month?',
    instructions: null,
    required: true,
    sequence: 1,
    acceptanceCriteria: null,
    sensitivity: 'general',
    options: null,
  },
  {
    actionType: 'acknowledge',
    answerFieldType: null,
    title: 'Policy acknowledgement',
    instructions: null,
    required: true,
    sequence: 2,
    acceptanceCriteria: null,
    sensitivity: 'general',
    options: null,
  },
];

async function seedReviewFixture(): Promise<RecipientFixture> {
  return seedRecipientFixture({ requirements: REVIEW_REQUIREMENTS });
}

async function findAssignment(workspaceId: WorkspaceId, requirementId: string) {
  const s = scoped(workspaceId);
  const [row] = await s.db
    .select()
    .from(schema.assignment)
    .where(eq(schema.assignment.requirementId, requirementId));
  if (!row) throw new Error('Fixture assignment not found.');
  return row;
}

async function submitUpload(fixture: RecipientFixture, assignmentId: string, filename = 'statement.pdf') {
  const reserved = await reserveSubmissionVersion(fixture.workspaceId, {
    partyId: fixture.partyId,
    caseId: fixture.caseId,
    assignmentId,
    originalFilename: filename,
    contentType: 'application/pdf',
    declaredBytes: 11,
  });
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
      originalFilename: filename,
      maxBytes: 1_000_000,
      exp: Date.now() + 60_000,
    },
  });
  if (!result.ok) throw new Error('Expected the fixture upload to succeed.');
  return { submissionVersionId: reserved.submissionVersionId, fileAssetId: result.fileAssetId };
}

async function submitAnswer(fixture: RecipientFixture, assignmentId: string, yes: boolean) {
  return recordAnswerSubmission(fixture.workspaceId, {
    partyId: fixture.partyId,
    caseId: fixture.caseId,
    assignmentId,
    actionType: 'answer',
    value: { fieldType: 'yes_no', yes },
  });
}

async function auditEventsFor(workspaceId: WorkspaceId, objectId: string) {
  const s = scoped(workspaceId);
  return s.db.select().from(schema.auditEvent).where(eq(schema.auditEvent.objectId, objectId));
}

describe('the rework loop: requesting changes on one assignment leaves another untouched', () => {
  it('leaves assignment B and its whole history byte-for-byte unaffected', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const assignmentA = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!); // answer — gets changes requested
    const assignmentB = await findAssignment(fixture.workspaceId, fixture.requirementIds[0]!); // upload — must stay untouched

    const subA = await submitAnswer(fixture, assignmentA.id, true);
    const subB = await submitUpload(fixture, assignmentB.id);

    const snapshotAssignmentB = (
      await s.db.select().from(schema.assignment).where(eq(schema.assignment.id, assignmentB.id))
    )[0];
    const snapshotVersionsB = await s.db
      .select()
      .from(schema.submissionVersion)
      .where(eq(schema.submissionVersion.assignmentId, assignmentB.id));
    const snapshotFileAssetsB = await s.db
      .select()
      .from(schema.fileAsset)
      .where(eq(schema.fileAsset.submissionVersionId, subB.submissionVersionId));
    const snapshotReviewsB = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, subB.submissionVersionId));

    await requestChanges(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: subA.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
      reason: 'Please confirm the exact loan amount.',
    });

    expect(
      (await s.db.select().from(schema.assignment).where(eq(schema.assignment.id, assignmentB.id)))[0],
    ).toEqual(snapshotAssignmentB);
    expect(
      await s.db.select().from(schema.submissionVersion).where(eq(schema.submissionVersion.assignmentId, assignmentB.id)),
    ).toEqual(snapshotVersionsB);
    expect(
      await s.db.select().from(schema.fileAsset).where(eq(schema.fileAsset.submissionVersionId, subB.submissionVersionId)),
    ).toEqual(snapshotFileAssetsB);
    expect(
      await s.db.select().from(schema.review).where(eq(schema.review.submissionVersionId, subB.submissionVersionId)),
    ).toEqual(snapshotReviewsB);

    // Meanwhile A really was reopened, exactly once.
    const [updatedA] = await s.db.select().from(schema.assignment).where(eq(schema.assignment.id, assignmentA.id));
    expect(updatedA?.fulfilmentStatus).toBe('in_progress');
    const reviewsA = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, subA.submissionVersionId));
    expect(reviewsA).toHaveLength(1);
    expect(reviewsA[0]?.reviewStatus).toBe('changes_requested');
    expect(reviewsA[0]?.reason).toBe('Please confirm the exact loan amount.');

    const events = await auditEventsFor(fixture.workspaceId, reviewsA[0]!.id);
    expect(events.filter((e) => e.eventType === 'review.changes_requested')).toHaveLength(1);
  });
});

describe('approveSubmission', () => {
  it('sets fulfilment to submitted, clears the draft, and completes the case once every item is resolved', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const uploadAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[0]!);
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);
    const ackAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[2]!);

    const upload = await submitUpload(fixture, uploadAssignment.id);
    const answer = await submitAnswer(fixture, answerAssignment.id, true);
    await recordAnswerSubmission(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: ackAssignment.id,
      actionType: 'acknowledge',
      value: { fieldType: 'acknowledge', acknowledged: true, statement: 'I agree to the policy.' },
    });

    await approveSubmission(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: upload.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
    });

    let [caseRow] = await s.db.select().from(schema.caseTable).where(eq(schema.caseTable.id, fixture.caseId));
    expect(caseRow?.completedAt).toBeNull(); // the answer still needs a decision

    await approveSubmission(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: answer.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
    });

    const [updatedAnswerAssignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, answerAssignment.id));
    expect(updatedAnswerAssignment?.fulfilmentStatus).toBe('submitted');
    expect(updatedAnswerAssignment?.draftValue).toBeNull();

    [caseRow] = await s.db.select().from(schema.caseTable).where(eq(schema.caseTable.id, fixture.caseId));
    expect(caseRow?.completedAt).not.toBeNull();

    const caseEvents = await auditEventsFor(fixture.workspaceId, fixture.caseId);
    expect(caseEvents.filter((e) => e.eventType === 'case.completed')).toHaveLength(1);
  });
});

describe('reversal', () => {
  async function completeCase(fixture: RecipientFixture) {
    const uploadAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[0]!);
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);
    const ackAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[2]!);

    const upload = await submitUpload(fixture, uploadAssignment.id);
    const answer = await submitAnswer(fixture, answerAssignment.id, true);
    await recordAnswerSubmission(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: ackAssignment.id,
      actionType: 'acknowledge',
      value: { fieldType: 'acknowledge', acknowledged: true, statement: 'I agree.' },
    });
    await approveSubmission(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: upload.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
    });
    await approveSubmission(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: answer.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
    });
    return { answerAssignment, answer };
  }

  it('reopening an approved item clears completed_at and audits case.reopened, with previousStatus recorded', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const { answerAssignment, answer } = await completeCase(fixture);

    let [caseRow] = await s.db.select().from(schema.caseTable).where(eq(schema.caseTable.id, fixture.caseId));
    expect(caseRow?.completedAt).not.toBeNull();

    await requestChanges(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: answer.submissionVersionId,
      expectedReviewNumber: 1, // it was reviewed once already, by the approval above
      reviewerUserId: fixture.userId,
      reason: 'Please double check the figure.',
    });

    const reviews = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, answer.submissionVersionId))
      .orderBy(asc(schema.review.reviewNumber));
    expect(reviews.map((r) => r.reviewNumber)).toEqual([1, 2]);
    expect(reviews[0]?.reviewStatus).toBe('approved');
    expect(reviews[1]?.reviewStatus).toBe('changes_requested');
    expect(reviews[1]?.reason).toBe('Please double check the figure.');

    const [reopenedAssignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, answerAssignment.id));
    expect(reopenedAssignment?.fulfilmentStatus).toBe('in_progress');

    [caseRow] = await s.db.select().from(schema.caseTable).where(eq(schema.caseTable.id, fixture.caseId));
    expect(caseRow?.completedAt).toBeNull();

    const caseEvents = await auditEventsFor(fixture.workspaceId, fixture.caseId);
    expect(caseEvents.filter((e) => e.eventType === 'case.reopened')).toHaveLength(1);

    const reviewEvent = (await auditEventsFor(fixture.workspaceId, reviews[1]!.id)).find(
      (e) => e.eventType === 'review.changes_requested',
    );
    expect(reviewEvent?.metadata).toMatchObject({ previousStatus: 'approved' });
  });

  it('approving as-is after changes were requested moves fulfilment back to submitted', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const uploadAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[0]!);
    const upload = await submitUpload(fixture, uploadAssignment.id);

    await requestChanges(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: upload.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
      reason: 'Actually, this is fine — approving as-is below.',
    });

    await approveSubmission(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: upload.submissionVersionId,
      expectedReviewNumber: 1,
      reviewerUserId: fixture.userId,
    });

    const [updated] = await s.db.select().from(schema.assignment).where(eq(schema.assignment.id, uploadAssignment.id));
    expect(updated?.fulfilmentStatus).toBe('submitted');

    const reviews = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, upload.submissionVersionId))
      .orderBy(asc(schema.review.reviewNumber));
    expect(reviews.map((r) => r.reviewStatus)).toEqual(['changes_requested', 'approved']);
    expect(reviews[1]?.reason).toBeNull();
  });
});

describe('requestChanges reason validation', () => {
  it('rejects an empty or whitespace-only reason and writes nothing', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);
    const sub = await submitAnswer(fixture, answerAssignment.id, true);

    await expect(
      requestChanges(fixture.workspaceId, {
        caseId: fixture.caseId,
        submissionVersionId: sub.submissionVersionId,
        expectedReviewNumber: 0,
        reviewerUserId: fixture.userId,
        reason: '   ',
      }),
    ).rejects.toThrow(InvalidReasonError);

    const reviews = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, sub.submissionVersionId));
    expect(reviews).toHaveLength(0);
  });

  it('rejects a reason over 1000 characters', async () => {
    const fixture = await seedReviewFixture();
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);
    const sub = await submitAnswer(fixture, answerAssignment.id, true);

    await expect(
      requestChanges(fixture.workspaceId, {
        caseId: fixture.caseId,
        submissionVersionId: sub.submissionVersionId,
        expectedReviewNumber: 0,
        reviewerUserId: fixture.userId,
        reason: 'x'.repeat(1001),
      }),
    ).rejects.toThrow(InvalidReasonError);
  });

  it('the database CHECK constraint independently rejects a changes_requested row with a blank reason', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);
    const sub = await submitAnswer(fixture, answerAssignment.id, true);

    await expect(
      s.db.insert(schema.review).values({
        workspaceId: fixture.workspaceId,
        submissionVersionId: sub.submissionVersionId,
        reviewNumber: 1,
        reviewStatus: 'changes_requested',
        reviewedBy: fixture.userId,
        reason: null,
      }),
    ).rejects.toThrow();
  });

  it('the database CHECK constraint allows an approved row with no reason', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);
    const sub = await submitAnswer(fixture, answerAssignment.id, true);

    await expect(
      s.db.insert(schema.review).values({
        workspaceId: fixture.workspaceId,
        submissionVersionId: sub.submissionVersionId,
        reviewNumber: 1,
        reviewStatus: 'approved',
        reviewedBy: fixture.userId,
        reason: null,
      }),
    ).resolves.not.toThrow();
  });
});

describe('conflicts', () => {
  it('two parallel approves with the same expectedReviewNumber produce exactly one review row', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const uploadAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[0]!);
    const upload = await submitUpload(fixture, uploadAssignment.id);

    const [a, b] = await Promise.allSettled([
      approveSubmission(fixture.workspaceId, {
        caseId: fixture.caseId,
        submissionVersionId: upload.submissionVersionId,
        expectedReviewNumber: 0,
        reviewerUserId: fixture.userId,
      }),
      approveSubmission(fixture.workspaceId, {
        caseId: fixture.caseId,
        submissionVersionId: upload.submissionVersionId,
        expectedReviewNumber: 0,
        reviewerUserId: fixture.userId,
      }),
    ]);

    const succeeded = [a, b].filter((r) => r.status === 'fulfilled');
    const failed = [a, b].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.reason).toBeInstanceOf(ReviewConflictError);

    const reviews = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, upload.submissionVersionId));
    expect(reviews).toHaveLength(1);
  });

  it('throws and writes nothing when reviewing a version that is no longer the assignment\'s latest completed one', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);

    const v1 = await submitAnswer(fixture, answerAssignment.id, true);
    await requestChanges(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: v1.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
      reason: 'Please redo this.',
    });
    await submitAnswer(fixture, answerAssignment.id, false); // v2 — now the latest

    await expect(
      approveSubmission(fixture.workspaceId, {
        caseId: fixture.caseId,
        submissionVersionId: v1.submissionVersionId, // stale
        expectedReviewNumber: 1,
        reviewerUserId: fixture.userId,
      }),
    ).rejects.toThrow(ReviewConflictError);

    const v1Reviews = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, v1.submissionVersionId));
    expect(v1Reviews).toHaveLength(1); // still just the original changes_requested decision
  });

  it('throws ReviewNotRequiredError for an acknowledgement and writes nothing', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const ackAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[2]!);
    const sub = await recordAnswerSubmission(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: ackAssignment.id,
      actionType: 'acknowledge',
      value: { fieldType: 'acknowledge', acknowledged: true, statement: 'I agree.' },
    });

    await expect(
      approveSubmission(fixture.workspaceId, {
        caseId: fixture.caseId,
        submissionVersionId: sub.submissionVersionId,
        expectedReviewNumber: 0,
        reviewerUserId: fixture.userId,
      }),
    ).rejects.toThrow(ReviewNotRequiredError);

    const reviews = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, sub.submissionVersionId));
    expect(reviews).toHaveLength(0);
  });

  it('throws and writes nothing for a version belonging to a different case in the same workspace', async () => {
    const fixtureA = await seedReviewFixture();
    const fixtureB = await seedFixtureCase(
      { workspaceId: fixtureA.workspaceId, userId: fixtureA.userId },
      { requirements: REVIEW_REQUIREMENTS },
    );
    const assignmentB = await findAssignment(fixtureA.workspaceId, fixtureB.requirementIds[0]!);
    const subB = await submitUpload({ ...fixtureA, ...fixtureB }, assignmentB.id);
    const s = scoped(fixtureA.workspaceId);

    await expect(
      approveSubmission(fixtureA.workspaceId, {
        caseId: fixtureA.caseId, // fixture A's case
        submissionVersionId: subB.submissionVersionId, // fixture B's version
        expectedReviewNumber: 0,
        reviewerUserId: fixtureA.userId,
      }),
    ).rejects.toThrow(ReviewConflictError);

    const reviews = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, subB.submissionVersionId));
    expect(reviews).toHaveLength(0);
  });
});

describe('concurrent completion (write-skew guard)', () => {
  it('resolving two different blocking items concurrently completes the case exactly once, with no deadlock', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const uploadAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[0]!);
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);
    const ackAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[2]!);

    const upload = await submitUpload(fixture, uploadAssignment.id);
    await approveSubmission(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: upload.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
    });
    const answer = await submitAnswer(fixture, answerAssignment.id, true);

    // Upload: accepted. Answer: needs_review. Acknowledgement: not yet
    // submitted (required, still awaiting_recipient). Two independent
    // items block completion — resolve both at once.
    const [ackResult, approveResult] = await Promise.all([
      recordAnswerSubmission(fixture.workspaceId, {
        partyId: fixture.partyId,
        caseId: fixture.caseId,
        assignmentId: ackAssignment.id,
        actionType: 'acknowledge',
        value: { fieldType: 'acknowledge', acknowledged: true, statement: 'I agree to the policy.' },
      }),
      approveSubmission(fixture.workspaceId, {
        caseId: fixture.caseId,
        submissionVersionId: answer.submissionVersionId,
        expectedReviewNumber: 0,
        reviewerUserId: fixture.userId,
      }),
    ]);
    expect(ackResult.submissionVersionId).toBeTruthy();
    expect(approveResult.reviewId).toBeTruthy();

    const [caseRow] = await s.db.select().from(schema.caseTable).where(eq(schema.caseTable.id, fixture.caseId));
    expect(caseRow?.completedAt).not.toBeNull();

    const caseEvents = await auditEventsFor(fixture.workspaceId, fixture.caseId);
    expect(caseEvents.filter((e) => e.eventType === 'case.completed')).toHaveLength(1);
  });
});

describe('rework chains', () => {
  it('an answer resubmission after request-changes creates v2 that supersedes v1, leaving v1 and its review untouched', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);

    const v1 = await submitAnswer(fixture, answerAssignment.id, true);
    await requestChanges(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: v1.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
      reason: 'Please reconsider.',
    });
    const v1Snapshot = (
      await s.db.select().from(schema.submissionVersion).where(eq(schema.submissionVersion.id, v1.submissionVersionId))
    )[0];
    const v1ReviewsSnapshot = await s.db
      .select()
      .from(schema.review)
      .where(eq(schema.review.submissionVersionId, v1.submissionVersionId));

    const v2 = await submitAnswer(fixture, answerAssignment.id, false);

    expect(v2.versionNumber).toBe(2);
    const [v2Row] = await s.db
      .select()
      .from(schema.submissionVersion)
      .where(eq(schema.submissionVersion.id, v2.submissionVersionId));
    expect(v2Row?.supersedesSubmissionId).toBe(v1.submissionVersionId);

    expect(
      (await s.db.select().from(schema.submissionVersion).where(eq(schema.submissionVersion.id, v1.submissionVersionId)))[0],
    ).toEqual(v1Snapshot);
    expect(
      await s.db.select().from(schema.review).where(eq(schema.review.submissionVersionId, v1.submissionVersionId)),
    ).toEqual(v1ReviewsSnapshot);
  });

  it('an upload resubmission chain supersedes v1 through an abandoned reservation, never the orphan', async () => {
    const fixture = await seedReviewFixture();
    const s = scoped(fixture.workspaceId);
    const uploadAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[0]!);

    const v1 = await submitUpload(fixture, uploadAssignment.id, 'v1.pdf');
    await requestChanges(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: v1.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
      reason: 'Wrong statement — please reupload the correct month.',
    });

    // Abandoned reservation — reserved, never finalized. Still counts
    // toward version numbering, but must never become "latest".
    await reserveSubmissionVersion(fixture.workspaceId, {
      partyId: fixture.partyId,
      caseId: fixture.caseId,
      assignmentId: uploadAssignment.id,
      originalFilename: 'abandoned.pdf',
      contentType: 'application/pdf',
      declaredBytes: 5,
    });

    const v3 = await submitUpload(fixture, uploadAssignment.id, 'v3.pdf');

    const [v3Row] = await s.db
      .select()
      .from(schema.submissionVersion)
      .where(eq(schema.submissionVersion.id, v3.submissionVersionId));
    expect(v3Row?.versionNumber).toBe(3);
    expect(v3Row?.supersedesSubmissionId).toBe(v1.submissionVersionId); // not the orphan v2

    const view = await getRecipientView({
      workspaceId: fixture.workspaceId,
      caseId: fixture.caseId,
      partyId: fixture.partyId,
      accessTokenId: fixture.accessTokenId,
    });
    const item = view?.items.find((i) => i.requirement.id === fixture.requirementIds[0]);
    expect(item?.latestSubmission?.submissionVersion.id).toBe(v3.submissionVersionId);
    expect(item?.latestSubmission?.fileAsset?.originalFilename).toBe('v3.pdf');
  });
});

describe('listOutstandingForReminder', () => {
  it('surfaces the changes-requested reason for the reopened item only, and drops it once resubmitted', async () => {
    const fixture = await seedReviewFixture();
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);

    const v1 = await submitAnswer(fixture, answerAssignment.id, true);
    await requestChanges(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: v1.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
      reason: 'Please recheck the figure.',
    });

    let outstanding = await listOutstandingForReminder(fixture.workspaceId, fixture.caseId);
    const answerItem = outstanding.find((o) => o.requirementId === fixture.requirementIds[1]);
    expect(answerItem?.state).toBe('changes_requested');
    expect(answerItem?.reason).toBe('Please recheck the figure.');

    const uploadItem = outstanding.find((o) => o.requirementId === fixture.requirementIds[0]);
    expect(uploadItem?.state).toBe('awaiting_recipient'); // never touched
    expect(uploadItem?.reason).toBeNull();

    await submitAnswer(fixture, answerAssignment.id, false); // resubmit

    outstanding = await listOutstandingForReminder(fixture.workspaceId, fixture.caseId);
    const answerItemAfter = outstanding.find((o) => o.requirementId === fixture.requirementIds[1]);
    expect(answerItemAfter).toBeUndefined(); // now needs_review — not the recipient's move anymore
  });
});
