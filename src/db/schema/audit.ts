import { index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspace } from './workspace';
import { caseTable } from './case';

/**
 * Append-only. Written in the same transaction as the state change it
 * records (techstack.md) — never a background write, never a log line,
 * or it did not happen. Hash-chain columns exist but chaining is
 * deferred past Phase 1a (§5) — immutability and retention are not.
 */
export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => caseTable.id, { onDelete: 'set null' }),
    actorType: text('actor_type').notNull(), // 'user' | 'party' | 'system'
    actorId: text('actor_id'),
    eventType: text('event_type').notNull(),
    objectType: text('object_type').notNull(),
    objectId: uuid('object_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'),
    previousEventHash: text('previous_event_hash'),
    eventHash: text('event_hash'),
  },
  (t) => [index('audit_event_case_id_occurred_at_idx').on(t.caseId, t.occurredAt)],
);
