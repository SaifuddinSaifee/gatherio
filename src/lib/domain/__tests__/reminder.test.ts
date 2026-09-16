import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import {
  seedFixtureCase,
  seedFixtureWorkspace,
  seedRecipientFixture,
  type RecipientFixture,
} from '@/db/testing';
import { markCaseViewed, recordAnswerSubmission } from '../submission';
import { requestChanges } from '../review';
import type { OutstandingForReminder } from '../case-status';
import {
  normalizeReminderNote,
  recordInviteDelivery,
  reminderEligibility,
  ReminderNotAllowedError,
  ReminderNoteTooLongError,
  MAX_BULK_REMINDERS,
  selectReminderItems,
  sendManualReminder,
  sendManualReminders,
  TooManyRemindersError,
} from '../reminder';
import { renderMessage } from '../messages';

const sendMock = vi.fn();

vi.mock('@/lib/adapters/notify', () => ({
  getNotifyAdapter: vi.fn(async () => ({ send: sendMock })),
}));

const REMINDER_REQUIREMENTS = [
  {
    actionType: 'upload' as const,
    answerFieldType: null,
    title: 'Bank statement',
    instructions: null,
    required: true,
    sequence: 0,
    acceptanceCriteria: null,
    sensitivity: 'general' as const,
    options: null,
  },
  {
    actionType: 'answer' as const,
    answerFieldType: 'yes_no' as const,
    title: 'Any new loans this month?',
    instructions: null,
    required: true,
    sequence: 1,
    acceptanceCriteria: null,
    sensitivity: 'general' as const,
    options: null,
  },
  {
    actionType: 'answer' as const,
    answerFieldType: 'short_text' as const,
    title: 'Nickname (optional)',
    instructions: null,
    required: false,
    sequence: 2,
    acceptanceCriteria: null,
    sensitivity: 'general' as const,
    options: null,
  },
];

async function seedReminderFixture(): Promise<RecipientFixture> {
  return seedRecipientFixture({ requirements: REMINDER_REQUIREMENTS });
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

async function submitAnswer(fixture: RecipientFixture, assignmentId: string, yes: boolean) {
  return recordAnswerSubmission(fixture.workspaceId, {
    partyId: fixture.partyId,
    caseId: fixture.caseId,
    assignmentId,
    actionType: 'answer',
    value: { fieldType: 'yes_no', yes },
  });
}

function outstandingItem(overrides: Partial<OutstandingForReminder> = {}): OutstandingForReminder {
  return {
    assignmentId: 'a1',
    requirementId: 'r1',
    title: 'Bank statement',
    required: true,
    state: 'awaiting_recipient',
    reason: null,
    reviewId: null,
    ...overrides,
  };
}

async function auditEventsFor(workspaceId: WorkspaceId, objectId: string) {
  const s = scoped(workspaceId);
  return s.db.select().from(schema.auditEvent).where(eq(schema.auditEvent.objectId, objectId));
}

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

describe('normalizeReminderNote', () => {
  it('turns null/undefined/empty/whitespace-only into null', () => {
    expect(normalizeReminderNote(null)).toBeNull();
    expect(normalizeReminderNote(undefined)).toBeNull();
    expect(normalizeReminderNote('')).toBeNull();
    expect(normalizeReminderNote('   \n  ')).toBeNull();
  });

  it('trims and normalizes CRLF to LF', () => {
    expect(normalizeReminderNote('  hi\r\nthere  ')).toBe('hi\nthere');
  });

  it('throws over 500 characters', () => {
    expect(() => normalizeReminderNote('a'.repeat(501))).toThrow(ReminderNoteTooLongError);
  });

  it('allows exactly 500 characters', () => {
    expect(normalizeReminderNote('a'.repeat(500))).toBe('a'.repeat(500));
  });
});

describe('selectReminderItems', () => {
  it('keeps required items and drops untouched optional ones', () => {
    const items = [
      outstandingItem({ assignmentId: 'required', required: true, state: 'awaiting_recipient' }),
      outstandingItem({ assignmentId: 'optional', required: false, state: 'awaiting_recipient' }),
    ];
    expect(selectReminderItems(items).map((i) => i.assignmentId)).toEqual(['required']);
  });

  it('keeps an optional item if it has changes requested', () => {
    const items = [
      outstandingItem({ assignmentId: 'optional-cr', required: false, state: 'changes_requested' }),
    ];
    expect(selectReminderItems(items).map((i) => i.assignmentId)).toEqual(['optional-cr']);
  });
});

describe('reminderEligibility', () => {
  const base = {
    caseStatus: 'awaiting_recipient' as const,
    reminderItemCount: 1,
    recipientEmail: 'a@example.com',
    lastReminderAt: null,
    now: new Date('2026-01-01T12:00:00Z'),
    cooldownMs: 900_000,
  };

  it('is ok when nothing blocks it', () => {
    expect(reminderEligibility(base)).toEqual({ ok: true });
  });

  it('refuses a complete case even with reminder items (shouldn\'t happen, but complete wins)', () => {
    expect(reminderEligibility({ ...base, caseStatus: 'complete' })).toEqual({
      ok: false,
      reason: 'complete',
    });
  });

  it('refuses when there is nothing to remind about', () => {
    expect(reminderEligibility({ ...base, reminderItemCount: 0 })).toEqual({
      ok: false,
      reason: 'nothing_outstanding',
    });
  });

  it('refuses when the recipient has no email', () => {
    expect(reminderEligibility({ ...base, recipientEmail: null })).toEqual({
      ok: false,
      reason: 'no_email',
    });
  });

  it('refuses inside the cooldown window and reports when it opens', () => {
    const lastReminderAt = new Date(base.now.getTime() - 5 * 60_000); // 5 min ago
    const result = reminderEligibility({ ...base, lastReminderAt });
    expect(result).toEqual({
      ok: false,
      reason: 'cooldown',
      availableAt: new Date(lastReminderAt.getTime() + base.cooldownMs),
    });
  });

  it('is ok exactly at the cooldown boundary', () => {
    const lastReminderAt = new Date(base.now.getTime() - base.cooldownMs);
    expect(reminderEligibility({ ...base, lastReminderAt })).toEqual({ ok: true });
  });

  it('is ok just past the cooldown window', () => {
    const lastReminderAt = new Date(base.now.getTime() - base.cooldownMs - 1);
    expect(reminderEligibility({ ...base, lastReminderAt })).toEqual({ ok: true });
  });
});

describe('reminder copy renderers', () => {
  it('unopened: lists only the given items, the note, and the case name in the subject', () => {
    const { subject, body } = renderMessage('case_reminder_unopened', {
      partyName: 'Alex',
      workspaceName: 'Acme Bookkeeping',
      caseName: 'Q3 Close',
      itemCount: '2',
      items: '- Bank statement\n- Any new loans this month?',
      dueLine: '',
      noteBlock: 'Message from Jordan:\n  Please prioritize this one.',
      link: 'https://gather.local/r/abc',
      expiresAt: 'January 1, 2027',
    });
    expect(subject).toContain('Q3 Close');
    expect(body).toContain('Bank statement');
    expect(body).toContain('Any new loans this month?');
    expect(body).toContain('Message from Jordan:');
    expect(body).toContain('Please prioritize this one.');
    expect(body).toContain('https://gather.local/r/abc');
    expect(body).not.toContain('undefined');
  });

  it('stalled: puts the reason under its item and omits the note block when absent', () => {
    const { subject, body } = renderMessage('case_reminder_stalled', {
      partyName: 'Alex',
      workspaceName: 'Acme Bookkeeping',
      caseName: 'Q3 Close',
      itemCount: '1',
      items: '- Bank statement\n    Changes requested: Wrong month',
      dueLine: 'Due January 5, 2027.',
      noteBlock: '',
      link: 'https://gather.local/r/def',
      expiresAt: 'January 1, 2027',
    });
    expect(subject).toContain('Q3 Close');
    expect(body).toContain('Changes requested: Wrong month');
    expect(body).toContain('Due January 5, 2027.');
    expect(body).not.toContain('Message from');
  });
});

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

describe('sendManualReminder', () => {
  it('sends, writes one delivery_attempt and one reminder_dispatch per named item, and audits reminder.sent', async () => {
    sendMock.mockReset().mockResolvedValueOnce({ providerMessageId: 'msg-1' });
    const fixture = await seedReminderFixture();

    const result = await sendManualReminder({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      caseId: fixture.caseId,
      note: 'Please send these by Friday.',
    });

    expect(result.status).toBe('sent');
    expect(result.itemCount).toBe(2); // the two required items; the optional untouched one is excluded

    const s = scoped(fixture.workspaceId);
    const attempts = await s.db
      .select()
      .from(schema.deliveryAttempt)
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe('sent');
    expect(attempts[0]?.templateRef).toBe('case_reminder_unopened');
    expect(attempts[0]?.providerMessageId).toBe('msg-1');
    expect(attempts[0]?.sentByUserId).toBe(fixture.userId);
    expect(attempts[0]?.note).toBe('Please send these by Friday.');

    const dispatches = await s.db
      .select()
      .from(schema.reminderDispatch)
      .where(eq(schema.reminderDispatch.deliveryAttemptId, attempts[0]!.id));
    expect(dispatches).toHaveLength(2);
    for (const d of dispatches) {
      expect(d.triggerType).toBe('manual');
      expect(d.reminderSequence).toBeNull();
    }

    const events = (await auditEventsFor(fixture.workspaceId, attempts[0]!.id)).filter(
      (e) => e.eventType === 'reminder.sent',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({ itemCount: 2, hasNote: true });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sentBody = sendMock.mock.calls[0]![0].body as string;
    expect(sentBody).toContain('Bank statement');
    expect(sentBody).toContain('Any new loans this month?');
    expect(sentBody).not.toContain('Nickname'); // untouched optional item stays out
    expect(sentBody).toContain('Please send these by Friday.');
  });

  it('snapshots the changes-requested reason onto its dispatch row and into the email', async () => {
    sendMock.mockReset().mockResolvedValueOnce({ providerMessageId: 'msg-2' });
    const fixture = await seedReminderFixture();
    const answerAssignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[1]!);
    const submitted = await submitAnswer(fixture, answerAssignment.id, true);

    await requestChanges(fixture.workspaceId, {
      caseId: fixture.caseId,
      submissionVersionId: submitted.submissionVersionId,
      expectedReviewNumber: 0,
      reviewerUserId: fixture.userId,
      reason: 'Please confirm the exact loan amount.',
    });

    await sendManualReminder({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      caseId: fixture.caseId,
    });

    const s = scoped(fixture.workspaceId);
    const [dispatch] = await s.db
      .select()
      .from(schema.reminderDispatch)
      .where(eq(schema.reminderDispatch.assignmentId, answerAssignment.id));
    expect(dispatch?.reasonSnapshot).toBe('Please confirm the exact loan amount.');

    const sentBody = sendMock.mock.calls[0]![0].body as string;
    expect(sentBody).toContain('Please confirm the exact loan amount.');
  });

  it('uses unopened copy before the case is viewed, and stalled copy after', async () => {
    sendMock.mockReset().mockResolvedValue({ providerMessageId: 'msg-3' });
    const fixture = await seedReminderFixture();

    const first = await sendManualReminder({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      caseId: fixture.caseId,
    });
    expect(first.status).toBe('sent');
    expect(sendMock.mock.calls[0]![0].templateRef).toBe('case_reminder_unopened');

    await markCaseViewed(fixture.workspaceId, { partyId: fixture.partyId, caseId: fixture.caseId });

    // Bypass the cooldown for this assertion by backdating the first attempt.
    const s = scoped(fixture.workspaceId);
    await s.db
      .update(schema.deliveryAttempt)
      .set({ createdAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));

    await sendManualReminder({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      caseId: fixture.caseId,
    });
    expect(sendMock.mock.calls[1]![0].templateRef).toBe('case_reminder_stalled');
  });

  it('refuses a second send inside the cooldown and writes nothing new', async () => {
    sendMock.mockReset().mockResolvedValue({ providerMessageId: 'msg-4' });
    const fixture = await seedReminderFixture();

    await sendManualReminder({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      caseId: fixture.caseId,
    });

    const s = scoped(fixture.workspaceId);
    const before = await s.db
      .select()
      .from(schema.deliveryAttempt)
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));
    expect(before).toHaveLength(1);

    await expect(
      sendManualReminder({ workspaceId: fixture.workspaceId, userId: fixture.userId, caseId: fixture.caseId }),
    ).rejects.toBeInstanceOf(ReminderNotAllowedError);

    const after = await s.db
      .select()
      .from(schema.deliveryAttempt)
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));
    expect(after).toHaveLength(1); // nothing new written
    expect(sendMock).toHaveBeenCalledTimes(1); // the refused call never reached the transport

    // Backdating past the cooldown allows a send again.
    await s.db
      .update(schema.deliveryAttempt)
      .set({ createdAt: new Date(Date.now() - 16 * 60_000) })
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));
    const retried = await sendManualReminder({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      caseId: fixture.caseId,
    });
    expect(retried.status).toBe('sent');
  });

  it('marks a notify failure as failed with no dispatch rows, and allows an immediate retry', async () => {
    sendMock.mockReset().mockRejectedValueOnce(new Error('SMTP refused the connection'));
    const fixture = await seedReminderFixture();

    const result = await sendManualReminder({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      caseId: fixture.caseId,
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('SMTP refused the connection');

    const s = scoped(fixture.workspaceId);
    const attempts = await s.db
      .select()
      .from(schema.deliveryAttempt)
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe('failed');
    expect(attempts[0]?.error).toContain('SMTP refused the connection');

    const dispatches = await s.db.select().from(schema.reminderDispatch);
    expect(dispatches.filter((d) => d.deliveryAttemptId === attempts[0]!.id)).toHaveLength(0);

    const failedEvents = (await auditEventsFor(fixture.workspaceId, attempts[0]!.id)).filter(
      (e) => e.eventType === 'reminder.send_failed',
    );
    expect(failedEvents).toHaveLength(1);

    // A failed attempt doesn't count toward the cooldown — retry immediately.
    sendMock.mockResolvedValueOnce({ providerMessageId: 'msg-retry' });
    const retried = await sendManualReminder({
      workspaceId: fixture.workspaceId,
      userId: fixture.userId,
      caseId: fixture.caseId,
    });
    expect(retried.status).toBe('sent');
  });

  it('refuses when the case is complete, when nothing is outstanding, or when the party has no email', async () => {
    sendMock.mockClear();
    // Complete: everything auto-accepted (acknowledge) or accepted.
    const complete = await seedRecipientFixture({
      requirements: [
        {
          actionType: 'acknowledge',
          answerFieldType: null,
          title: 'Policy acknowledgement',
          instructions: null,
          required: true,
          sequence: 0,
          acceptanceCriteria: null,
          sensitivity: 'general',
          options: null,
        },
      ],
    });
    const ackAssignment = await findAssignment(complete.workspaceId, complete.requirementIds[0]!);
    await recordAnswerSubmission(complete.workspaceId, {
      partyId: complete.partyId,
      caseId: complete.caseId,
      assignmentId: ackAssignment.id,
      actionType: 'acknowledge',
      value: { fieldType: 'acknowledge', acknowledged: true, statement: 'I confirm.' },
    });
    await expect(
      sendManualReminder({ workspaceId: complete.workspaceId, userId: complete.userId, caseId: complete.caseId }),
    ).rejects.toMatchObject({ reason: 'complete' });

    // Nothing outstanding: only a needs-review item remains (required, submitted, unreviewed).
    const needsReview = await seedRecipientFixture({
      requirements: [
        {
          actionType: 'answer',
          answerFieldType: 'yes_no',
          title: 'Any new loans?',
          instructions: null,
          required: true,
          sequence: 0,
          acceptanceCriteria: null,
          sensitivity: 'general',
          options: null,
        },
      ],
    });
    const nrAssignment = await findAssignment(needsReview.workspaceId, needsReview.requirementIds[0]!);
    await submitAnswer(needsReview, nrAssignment.id, false);
    await expect(
      sendManualReminder({
        workspaceId: needsReview.workspaceId,
        userId: needsReview.userId,
        caseId: needsReview.caseId,
      }),
    ).rejects.toMatchObject({ reason: 'nothing_outstanding' });

    // No email on file.
    const noEmail = await seedRecipientFixture({ party: { email: null } });
    await expect(
      sendManualReminder({ workspaceId: noEmail.workspaceId, userId: noEmail.userId, caseId: noEmail.caseId }),
    ).rejects.toMatchObject({ reason: 'no_email' });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('bulk: sends to each case independently, counting sent, skipped, and failed', async () => {
    sendMock
      .mockReset()
      .mockResolvedValueOnce({ providerMessageId: 'msg-bulk-1' })
      .mockRejectedValueOnce(new Error('SMTP refused the connection'));
    const workspace = await seedFixtureWorkspace();
    const willSend = await seedFixtureCase(workspace, { requirements: REMINDER_REQUIREMENTS });
    const noEmail = await seedFixtureCase(workspace, { requirements: REMINDER_REQUIREMENTS, party: { email: null } });
    const willFail = await seedFixtureCase(workspace, { requirements: REMINDER_REQUIREMENTS });

    const result = await sendManualReminders({
      workspaceId: workspace.workspaceId,
      userId: workspace.userId,
      // The duplicate must not turn into a second send (or a cooldown "skip").
      caseIds: [willSend.caseId, noEmail.caseId, willSend.caseId, willFail.caseId],
    });

    expect(result).toEqual({ sent: 1, skipped: 1, failed: 1 });
    expect(sendMock).toHaveBeenCalledTimes(2);

    const s = scoped(workspace.workspaceId);
    const attempts = await s.db
      .select({ partyId: schema.deliveryAttempt.partyId, status: schema.deliveryAttempt.status })
      .from(schema.deliveryAttempt)
      .where(eq(schema.deliveryAttempt.templateRef, 'case_reminder_unopened'));
    expect(attempts).toEqual(
      expect.arrayContaining([
        { partyId: willSend.partyId, status: 'sent' },
        { partyId: willFail.partyId, status: 'failed' },
      ]),
    );
    expect(attempts.some((a) => a.partyId === noEmail.partyId)).toBe(false);
  });

  it('bulk: refuses more than the cap before sending anything', async () => {
    sendMock.mockClear();
    const workspace = await seedFixtureWorkspace();
    const caseIds = Array.from({ length: MAX_BULK_REMINDERS + 1 }, () => randomUUID());

    await expect(
      sendManualReminders({ workspaceId: workspace.workspaceId, userId: workspace.userId, caseIds }),
    ).rejects.toBeInstanceOf(TooManyRemindersError);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('under concurrency, exactly one send succeeds and the other is refused by the cooldown', async () => {
    sendMock.mockReset().mockResolvedValue({ providerMessageId: 'msg-race' });
    const fixture = await seedReminderFixture();

    const [a, b] = await Promise.allSettled([
      sendManualReminder({ workspaceId: fixture.workspaceId, userId: fixture.userId, caseId: fixture.caseId }),
      sendManualReminder({ workspaceId: fixture.workspaceId, userId: fixture.userId, caseId: fixture.caseId }),
    ]);

    const outcomes = [a, b];
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ReminderNotAllowedError);

    const s = scoped(fixture.workspaceId);
    const attempts = await s.db
      .select()
      .from(schema.deliveryAttempt)
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));
    expect(attempts).toHaveLength(1);
  });

  it('database constraints: only scheduled dispatches occupy the idempotency sequence', async () => {
    const fixture = await seedReminderFixture();
    const assignment = await findAssignment(fixture.workspaceId, fixture.requirementIds[0]!);
    const s = scoped(fixture.workspaceId);

    await s.db.insert(schema.reminderDispatch).values({
      workspaceId: fixture.workspaceId,
      assignmentId: assignment.id,
      triggerType: 'scheduled',
      reminderSequence: 1,
    });
    await expect(
      s.db.insert(schema.reminderDispatch).values({
        workspaceId: fixture.workspaceId,
        assignmentId: assignment.id,
        triggerType: 'scheduled',
        reminderSequence: 1,
      }),
    ).rejects.toThrow();

    // Two manual rows with a null sequence are fine — they're outside the sequence entirely.
    await s.db.insert(schema.reminderDispatch).values({
      workspaceId: fixture.workspaceId,
      assignmentId: assignment.id,
      triggerType: 'manual',
      reminderSequence: null,
    });
    await s.db.insert(schema.reminderDispatch).values({
      workspaceId: fixture.workspaceId,
      assignmentId: assignment.id,
      triggerType: 'manual',
      reminderSequence: null,
    });

    // A scheduled row with a null sequence violates the CHECK constraint.
    await expect(
      s.db.insert(schema.reminderDispatch).values({
        workspaceId: fixture.workspaceId,
        assignmentId: assignment.id,
        triggerType: 'scheduled',
        reminderSequence: null,
      }),
    ).rejects.toThrow();
  });
});

describe('recordInviteDelivery', () => {
  it('writes a case_invite delivery_attempt and the case.invite_sent audit event', async () => {
    const fixture = await seedReminderFixture();

    await recordInviteDelivery(fixture.workspaceId, fixture.caseId, fixture.userId, {
      partyId: fixture.partyId,
      recipient: 'recipient@example.com',
      sent: true,
      providerMessageId: 'invite-1',
    });

    const s = scoped(fixture.workspaceId);
    const [attempt] = await s.db
      .select()
      .from(schema.deliveryAttempt)
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));
    expect(attempt?.templateRef).toBe('case_invite');
    expect(attempt?.status).toBe('sent');
    expect(attempt?.providerMessageId).toBe('invite-1');

    const events = (await auditEventsFor(fixture.workspaceId, fixture.caseId)).filter(
      (e) => e.eventType === 'case.invite_sent',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({ sent: true });
  });

  it('records a failed invite with its error', async () => {
    const fixture = await seedReminderFixture();

    await recordInviteDelivery(fixture.workspaceId, fixture.caseId, fixture.userId, {
      partyId: fixture.partyId,
      recipient: 'recipient@example.com',
      sent: false,
      error: 'Connection refused',
    });

    const s = scoped(fixture.workspaceId);
    const [attempt] = await s.db
      .select()
      .from(schema.deliveryAttempt)
      .where(eq(schema.deliveryAttempt.partyId, fixture.partyId));
    expect(attempt?.status).toBe('failed');
    expect(attempt?.error).toBe('Connection refused');
  });
});
