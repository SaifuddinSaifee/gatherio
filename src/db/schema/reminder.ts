import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { deliveryStatus, reminderTrigger } from './enums';
import { workspace } from './workspace';
import { caseTable, party } from './case';
import { assignment } from './requirement';
import { user } from './auth';

export const reminderPolicy = pgTable('reminder_policy', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  caseId: uuid('case_id')
    .notNull()
    .references(() => caseTable.id, { onDelete: 'cascade' }),
  /** Cron-like cadence expression, e.g. "P2D" for every 2 days. */
  cadence: text('cadence').notNull().default('P2D'),
  channels: jsonb('channels').notNull().default(['email']),
  quietHoursStart: integer('quiet_hours_start').notNull().default(21),
  quietHoursEnd: integer('quiet_hours_end').notNull().default(8),
  stopCondition: text('stop_condition').notNull().default('all_submitted'),
  /** §5: unopened vs. opened-and-stalled select materially different copy. */
  unopenedCadence: text('unopened_cadence').notNull().default('P1D'),
  stalledCadence: text('stalled_cadence').notNull().default('P3D'),
});

/**
 * One email (or, later, SMS/WhatsApp message) actually attempted to one
 * party — an invite or a reminder. Stage 8.5: a reminder naming N items
 * is one attempt plus N reminder_dispatch rows pointing back at it.
 *
 * A manual reminder is claimed as `queued` before the network call and
 * finalized to `sent`/`failed` after it, so a concurrent second send sees
 * the claim and is refused by the cooldown.
 */
export const deliveryAttempt = pgTable(
  'delivery_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => party.id),
    channel: text('channel').notNull(),
    /** messages.ts key: case_invite | case_reminder_unopened | case_reminder_stalled. */
    templateRef: text('template_ref').notNull(),
    status: deliveryStatus('status').notNull().default('queued'),
    /** Null for system-initiated sends (Stage 8's scheduler). */
    sentByUserId: text('sent_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** The requester's optional plain-text note on a manual reminder. */
    note: text('note'),
    /** Provider error text when status = 'failed'. */
    error: text('error'),
    providerMessageId: text('provider_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    bouncedAt: timestamp('bounced_at', { withTimezone: true }),
  },
  (t) => [index('delivery_attempt_party_id_created_at_idx').on(t.partyId, t.createdAt)],
);

/**
 * Idempotency guard (techstack.md): the partial unique index on
 * (assignment_id, reminder_sequence) means a redeploy mid-queue or a
 * retry of the scheduled reminder job cannot double-send. Enforced at the
 * DB layer, not just in application logic, because that is the failure a
 * pilot customer notices first.
 *
 * Only `scheduled` rows carry a sequence number (the CHECK below). A
 * manual or conditional send is its own row outside that sequence
 * (product.md §5), so a requester's "Send reminder" never consumes a slot
 * the automated cadence is counting on.
 */
export const reminderDispatch = pgTable(
  'reminder_dispatch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignment.id, { onDelete: 'cascade' }),
    triggerType: reminderTrigger('trigger_type').notNull().default('scheduled'),
    reminderSequence: integer('reminder_sequence'),
    deliveryAttemptId: uuid('delivery_attempt_id').references(() => deliveryAttempt.id, {
      onDelete: 'cascade',
    }),
    reasonSnapshot: text('reason_snapshot'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reminder_dispatch_assignment_id_reminder_sequence_key')
      .on(t.assignmentId, t.reminderSequence)
      .where(sql`${t.triggerType} = 'scheduled'`),
    index('reminder_dispatch_delivery_attempt_id_idx').on(t.deliveryAttemptId),
    check(
      'reminder_dispatch_sequence_matches_trigger',
      sql`(${t.triggerType} = 'scheduled') = (${t.reminderSequence} IS NOT NULL)`,
    ),
  ],
);
