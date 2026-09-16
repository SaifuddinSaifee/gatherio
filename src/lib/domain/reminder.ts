/**
 * Stage 8.5: a requester's manual, email-only "Send reminder" — the
 * pre-pilot slice that ships ahead of Stage 8's automated pg-boss cadence
 * engine (CHECKLIST.md, product.md §5). Deliberately narrow: fixed system
 * copy plus an optional plain-text note, no MessageTemplate, no @/#
 * mentions, no channel branching. Every function here that Stage 8 can
 * reuse says so.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import { withAudit, type Tx } from '@/db/audit';
import { env } from '@/lib/env';
import { getNotifyAdapter } from '@/lib/adapters/notify';
import { renderMessage } from './messages';
import { issueCaseAccess } from './case';
import {
  caseStatusFromInputs,
  loadCaseStatusInputs,
  normalizeReminderNote,
  outstandingFromInputs,
  reminderEligibility,
  ReminderNotAllowedError,
  selectReminderItems,
  type Executor,
  type OutstandingForReminder,
  type ReminderEligibility,
} from './case-status';

export {
  normalizeReminderNote,
  reminderEligibility,
  ReminderNoteTooLongError,
  ReminderNotAllowedError,
  selectReminderItems,
  type ReminderEligibility,
  type ReminderRefusalReason,
} from './case-status';

function formatItemsBlock(items: readonly OutstandingForReminder[]): string {
  return items
    .map((item) => {
      const reason = item.state === 'changes_requested' && item.reason ? item.reason : null;
      const bullet = `- ${item.title}`;
      return reason ? `${bullet}\n    Changes requested: ${reason}` : bullet;
    })
    .join('\n');
}

function formatDueLine(dueAt: Date | null): string {
  if (!dueAt) return '';
  return `Due ${dueAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`;
}

function formatNoteBlock(note: string | null, requesterName: string): string {
  if (!note) return '';
  return `Message from ${requesterName}:\n  ${note}`;
}

export type ReminderVariant = 'case_reminder_unopened' | 'case_reminder_stalled';

/** Stage 8's scheduler reuses this: unopened vs. stalled is exactly whether the case has ever been viewed. */
export async function reminderVariant(
  workspaceId: WorkspaceId,
  caseId: string,
): Promise<ReminderVariant> {
  const s = scoped(workspaceId);
  const [viewed] = await s.db
    .select({ id: schema.auditEvent.id })
    .from(schema.auditEvent)
    .where(
      s.where(
        schema.auditEvent.workspaceId,
        and(eq(schema.auditEvent.caseId, caseId), eq(schema.auditEvent.eventType, 'case.viewed')),
      ),
    )
    .limit(1);
  return viewed ? 'case_reminder_stalled' : 'case_reminder_unopened';
}

export interface ReminderHistoryEntry {
  id: string;
  templateRef: string;
  status: (typeof schema.deliveryAttempt.$inferSelect)['status'];
  note: string | null;
  error: string | null;
  createdAt: Date;
  sentByName: string | null;
  itemCount: number;
}

export interface CaseReminderPanel {
  eligibility: ReminderEligibility;
  items: OutstandingForReminder[];
  recipientEmail: string | null;
  variant: ReminderVariant;
  history: ReminderHistoryEntry[];
}

/** Everything the case page's reminder card needs, in a fixed small number of queries. */
export async function getCaseReminderPanel(
  workspaceId: WorkspaceId,
  caseId: string,
  now: Date = new Date(),
): Promise<CaseReminderPanel> {
  const s = scoped(workspaceId);

  const [inputs, [partyRow], variant] = await Promise.all([
    loadCaseStatusInputs(s.db, workspaceId, [caseId]),
    s.db
      .select({ email: schema.party.email })
      .from(schema.party)
      .where(eq(schema.party.caseId, caseId))
      .orderBy(schema.party.createdAt)
      .limit(1),
    reminderVariant(workspaceId, caseId),
  ]);

  const { status } = caseStatusFromInputs(inputs);
  const items = selectReminderItems(outstandingFromInputs(inputs));

  const lastReminder = await latestReminderAttempt(s.db, workspaceId, caseId);

  const eligibility = reminderEligibility({
    caseStatus: status,
    reminderItemCount: items.length,
    recipientEmail: partyRow?.email ?? null,
    lastReminderAt: lastReminder?.createdAt ?? null,
    now,
    cooldownMs: env.REMINDER_COOLDOWN_SECONDS * 1000,
  });

  const history = await loadReminderHistory(s.db, workspaceId, caseId);

  return { eligibility, items, recipientEmail: partyRow?.email ?? null, variant, history };
}

async function latestReminderAttempt(
  ex: Executor,
  workspaceId: WorkspaceId,
  caseId: string,
): Promise<{ createdAt: Date } | null> {
  const s = scoped(workspaceId);
  const [row] = await ex
    .select({ createdAt: schema.deliveryAttempt.createdAt })
    .from(schema.deliveryAttempt)
    .innerJoin(schema.party, eq(schema.party.id, schema.deliveryAttempt.partyId))
    .where(
      s.where(
        schema.deliveryAttempt.workspaceId,
        and(
          eq(schema.party.caseId, caseId),
          inArray(schema.deliveryAttempt.templateRef, [
            'case_reminder_unopened',
            'case_reminder_stalled',
          ]),
          inArray(schema.deliveryAttempt.status, ['queued', 'sent']),
        ),
      ),
    )
    .orderBy(desc(schema.deliveryAttempt.createdAt))
    .limit(1);
  return row ?? null;
}

async function loadReminderHistory(
  ex: Executor,
  workspaceId: WorkspaceId,
  caseId: string,
): Promise<ReminderHistoryEntry[]> {
  const s = scoped(workspaceId);
  const attempts = await ex
    .select({
      id: schema.deliveryAttempt.id,
      templateRef: schema.deliveryAttempt.templateRef,
      status: schema.deliveryAttempt.status,
      note: schema.deliveryAttempt.note,
      error: schema.deliveryAttempt.error,
      createdAt: schema.deliveryAttempt.createdAt,
      sentByName: schema.user.name,
    })
    .from(schema.deliveryAttempt)
    .innerJoin(schema.party, eq(schema.party.id, schema.deliveryAttempt.partyId))
    .leftJoin(schema.user, eq(schema.user.id, schema.deliveryAttempt.sentByUserId))
    .where(s.where(schema.deliveryAttempt.workspaceId, eq(schema.party.caseId, caseId)))
    .orderBy(desc(schema.deliveryAttempt.createdAt))
    .limit(20);

  if (attempts.length === 0) return [];

  const counts = await ex
    .select({
      deliveryAttemptId: schema.reminderDispatch.deliveryAttemptId,
      assignmentId: schema.reminderDispatch.assignmentId,
    })
    .from(schema.reminderDispatch)
    .where(
      inArray(
        schema.reminderDispatch.deliveryAttemptId,
        attempts.map((a) => a.id),
      ),
    );
  const countByAttempt = new Map<string, number>();
  for (const row of counts) {
    if (!row.deliveryAttemptId) continue;
    countByAttempt.set(row.deliveryAttemptId, (countByAttempt.get(row.deliveryAttemptId) ?? 0) + 1);
  }

  return attempts.map((a) => ({ ...a, itemCount: countByAttempt.get(a.id) ?? 0 }));
}

export interface SendManualReminderInput {
  workspaceId: WorkspaceId;
  userId: string;
  caseId: string;
  note?: string | null;
  now?: Date;
}

export interface SendManualReminderResult {
  status: 'sent' | 'failed';
  recipient: string;
  itemCount: number;
  error?: string;
}

/**
 * Claim -> send -> finalize (design decision 1). The claim locks the case
 * row and re-checks eligibility under that lock, so two concurrent sends
 * on the same case serialize and the second one is refused by the
 * cooldown instead of both going out. The transport call itself never
 * happens inside a transaction (existing project rule).
 */
export async function sendManualReminder(
  input: SendManualReminderInput,
): Promise<SendManualReminderResult> {
  const { workspaceId, userId, caseId } = input;
  const now = input.now ?? new Date();
  const note = normalizeReminderNote(input.note ?? null);
  const s = scoped(workspaceId);

  const claim = await s.db.transaction(async (tx) => {
    await tx
      .select({ id: schema.caseTable.id })
      .from(schema.caseTable)
      .where(s.where(schema.caseTable.workspaceId, eq(schema.caseTable.id, caseId)))
      .for('no key update', { of: schema.caseTable });

    const [caseRow] = await tx
      .select({ id: schema.caseTable.id, name: schema.caseTable.name, dueAt: schema.caseTable.dueAt })
      .from(schema.caseTable)
      .where(s.where(schema.caseTable.workspaceId, eq(schema.caseTable.id, caseId)))
      .limit(1);
    if (!caseRow) throw new Error('Case not found.');

    const [partyRow] = await tx
      .select()
      .from(schema.party)
      .where(eq(schema.party.caseId, caseId))
      .orderBy(schema.party.createdAt)
      .limit(1);
    if (!partyRow) throw new Error('This case has no recipient.');

    const inputs = await loadCaseStatusInputs(tx, workspaceId, [caseId]);
    const { status } = caseStatusFromInputs(inputs);
    const items = selectReminderItems(outstandingFromInputs(inputs));
    const lastReminder = await latestReminderAttempt(tx, workspaceId, caseId);

    const eligibility = reminderEligibility({
      caseStatus: status,
      reminderItemCount: items.length,
      recipientEmail: partyRow.email,
      lastReminderAt: lastReminder?.createdAt ?? null,
      now,
      cooldownMs: env.REMINDER_COOLDOWN_SECONDS * 1000,
    });
    if (!eligibility.ok) throw new ReminderNotAllowedError(eligibility.reason, eligibility.availableAt);

    const variant = (await reminderVariant(workspaceId, caseId)) satisfies ReminderVariant;

    const [attempt] = await tx
      .insert(schema.deliveryAttempt)
      .values({
        workspaceId,
        partyId: partyRow.id,
        channel: 'email',
        templateRef: variant,
        status: 'queued',
        sentByUserId: userId,
        note,
      })
      .returning();
    if (!attempt) throw new Error('Failed to claim a reminder attempt.');

    return { caseRow, party: partyRow, items, variant, attemptId: attempt.id };
  });

  // Requester name for the "Message from {requester}" line — best-effort,
  // never blocks the send.
  const [requesterRow] = await s.db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  const requesterName = requesterRow?.name ?? 'Your requester';

  let sendOutcome: { ok: true; providerMessageId?: string } | { ok: false; error: string };
  let link: string | null = null;
  try {
    const issued = await issueCaseAccess(workspaceId, userId, caseId, 'resend');
    link = `${env.APP_URL}/r/${issued.token}`;

    const variables: Record<string, string> = {
      partyName: claim.party.displayName,
      workspaceName: (await getWorkspaceName(workspaceId)) ?? 'Your workspace',
      caseName: claim.caseRow.name,
      itemCount: String(claim.items.length),
      items: formatItemsBlock(claim.items),
      dueLine: formatDueLine(claim.caseRow.dueAt),
      noteBlock: formatNoteBlock(note, requesterName),
      link,
      expiresAt: issued.expiresAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };

    const { subject, body } = renderMessage(claim.variant, variables);
    const adapter = await getNotifyAdapter();
    const result = await adapter.send({
      channel: 'email',
      recipient: { email: claim.party.email! },
      templateRef: claim.variant,
      variables,
      subject,
      body,
    });
    sendOutcome = { ok: true, providerMessageId: result.providerMessageId };
  } catch (err) {
    sendOutcome = { ok: false, error: err instanceof Error ? err.message : 'Failed to send the reminder email.' };
  }

  await s.db.transaction(async (tx) => {
    await tx
      .update(schema.deliveryAttempt)
      .set(
        sendOutcome.ok
          ? { status: 'sent', sentAt: new Date(), providerMessageId: sendOutcome.providerMessageId }
          : { status: 'failed', error: sendOutcome.error },
      )
      .where(eq(schema.deliveryAttempt.id, claim.attemptId));

    if (sendOutcome.ok) {
      await tx.insert(schema.reminderDispatch).values(
        claim.items.map((item) => ({
          workspaceId,
          assignmentId: item.assignmentId,
          triggerType: 'manual' as const,
          reminderSequence: null,
          deliveryAttemptId: claim.attemptId,
          reasonSnapshot: item.reason,
        })),
      );
    }

    await withAudit(tx, {
      workspaceId,
      caseId,
      actorType: 'user',
      actorId: userId,
      eventType: sendOutcome.ok ? 'reminder.sent' : 'reminder.send_failed',
      objectType: 'delivery_attempt',
      objectId: claim.attemptId,
      metadata: {
        deliveryAttemptId: claim.attemptId,
        templateRef: claim.variant,
        itemCount: claim.items.length,
        recipient: claim.party.email,
        hasNote: note !== null,
        ...(sendOutcome.ok ? {} : { error: sendOutcome.error }),
      },
    });
  });

  return sendOutcome.ok
    ? { status: 'sent', recipient: claim.party.email!, itemCount: claim.items.length }
    : {
        status: 'failed',
        recipient: claim.party.email!,
        itemCount: claim.items.length,
        error: sendOutcome.error,
      };
}

export const MAX_BULK_REMINDERS = 100;

export interface SendManualRemindersInput {
  workspaceId: WorkspaceId;
  userId: string;
  caseIds: readonly string[];
  now?: Date;
}

export interface SendManualRemindersResult {
  sent: number;
  /** Refused by eligibility at send time — complete, nothing outstanding, no email, or cooling down. */
  skipped: number;
  failed: number;
}

export class TooManyRemindersError extends Error {
  constructor(count: number) {
    super(`You selected ${count} cases — reminders can be sent to at most ${MAX_BULK_REMINDERS} at once.`);
    this.name = 'TooManyRemindersError';
  }
}

/**
 * Stage 8.6 bulk send. Deliberately one `sendManualReminder` per case, in
 * sequence — every email keeps the same claim → send → finalize
 * guarantees as a single send, and one case failing never stops the rest.
 */
export async function sendManualReminders(input: SendManualRemindersInput): Promise<SendManualRemindersResult> {
  const caseIds = [...new Set(input.caseIds)];
  if (caseIds.length > MAX_BULK_REMINDERS) throw new TooManyRemindersError(caseIds.length);

  const result: SendManualRemindersResult = { sent: 0, skipped: 0, failed: 0 };
  for (const caseId of caseIds) {
    try {
      const outcome = await sendManualReminder({
        workspaceId: input.workspaceId,
        userId: input.userId,
        caseId,
        now: input.now,
      });
      result[outcome.status === 'sent' ? 'sent' : 'failed'] += 1;
    } catch (err) {
      if (err instanceof ReminderNotAllowedError) {
        result.skipped += 1;
      } else {
        console.error(`sendManualReminders: case ${caseId} failed unexpectedly`, err);
        result.failed += 1;
      }
    }
  }
  return result;
}

async function getWorkspaceName(workspaceId: WorkspaceId): Promise<string | null> {
  const { getWorkspaceById } = await import('@/db/workspace');
  const workspace = await getWorkspaceById(workspaceId);
  return workspace?.name ?? null;
}

export interface RecordInviteDeliveryInput {
  partyId: string;
  recipient: string;
  sent: boolean;
  providerMessageId?: string;
  error?: string;
}

/**
 * Replaces case.ts's old recordInviteSent: writes a delivery_attempt (so
 * "last contacted" on the dashboard includes invites, and a failed invite
 * is visibly failed rather than reported as "An invite was sent") plus
 * the existing case.invite_sent audit event, in one transaction.
 */
export async function recordInviteDelivery(
  workspaceId: WorkspaceId,
  caseId: string,
  userId: string,
  input: RecordInviteDeliveryInput,
): Promise<void> {
  const s = scoped(workspaceId);
  await s.db.transaction(async (tx: Tx) => {
    await tx.insert(schema.deliveryAttempt).values({
      workspaceId,
      partyId: input.partyId,
      channel: 'email',
      templateRef: 'case_invite',
      status: input.sent ? 'sent' : 'failed',
      sentByUserId: userId,
      sentAt: input.sent ? new Date() : undefined,
      providerMessageId: input.providerMessageId,
      error: input.error,
    });

    await withAudit(tx, {
      workspaceId,
      caseId,
      actorType: 'user',
      actorId: userId,
      eventType: 'case.invite_sent',
      objectType: 'case',
      objectId: caseId,
      metadata: {
        channel: 'email',
        recipient: input.recipient,
        sent: input.sent,
        providerMessageId: input.providerMessageId ?? null,
        error: input.error ?? null,
        templateRef: 'case_invite',
      },
    });
  });
}
