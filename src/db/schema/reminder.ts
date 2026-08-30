import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { deliveryStatus } from './enums';
import { workspace } from './workspace';
import { caseTable, party } from './case';
import { assignment } from './requirement';

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
 * Idempotency guard (techstack.md): the unique constraint on
 * (assignment_id, reminder_sequence) below means a redeploy mid-queue or
 * a retry cannot double-send. Enforced at the DB layer, not just in
 * application logic, because that is the failure a pilot customer
 * notices first.
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
    reminderSequence: integer('reminder_sequence').notNull(),
    reasonSnapshot: text('reason_snapshot'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reminder_dispatch_assignment_id_reminder_sequence_key').on(
      t.assignmentId,
      t.reminderSequence,
    ),
  ],
);

export const deliveryAttempt = pgTable('delivery_attempt', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  reminderDispatchId: uuid('reminder_dispatch_id').references(() => reminderDispatch.id, {
    onDelete: 'cascade',
  }),
  partyId: uuid('party_id')
    .notNull()
    .references(() => party.id),
  channel: text('channel').notNull(),
  status: deliveryStatus('status').notNull().default('queued'),
  providerMessageId: text('provider_message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  bouncedAt: timestamp('bounced_at', { withTimezone: true }),
});
