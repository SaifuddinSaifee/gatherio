import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actionType, answerFieldType, fulfilmentStatus, requirementSensitivity } from './enums';
import { workspace } from './workspace';
import { caseTable, party } from './case';

/** One thing that must be completed within a case. Snapshotted from a requirement_definition at case instantiation (Stage 5). */
export const requirement = pgTable(
  'requirement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => caseTable.id, { onDelete: 'cascade' }),
    actionType: actionType('action_type').notNull(),
    answerFieldType: answerFieldType('answer_field_type'),
    title: text('title').notNull(),
    instructions: text('instructions'),
    required: boolean('required').notNull().default(true),
    sequence: integer('sequence').notNull().default(0),
    acceptanceCriteria: text('acceptance_criteria'),
    sensitivity: requirementSensitivity('sensitivity').notNull().default('general'),
    /**
     * Set only when answerFieldType = 'choice' — the list of selectable
     * values (Stage 6). Snapshotted from requirement_definition.options at
     * case instantiation, same immutability principle as every other
     * requirement column.
     */
    options: jsonb('options').$type<string[] | null>(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('requirement_case_id_idx').on(t.caseId)],
);

/**
 * Connects a requirement to a party. Deliberately its own entity, never
 * collapsed into requirement (§5): one recipient can hold multiple
 * requirements, one requirement can involve multiple recipients, and
 * assignment-specific status must be able to differ per party. This is
 * the join that makes multi-party cases possible without a schema
 * rewrite when Phase 1b turns it on.
 */
export const assignment = pgTable(
  'assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirement.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => party.id, { onDelete: 'cascade' }),
    fulfilmentStatus: fulfilmentStatus('fulfilment_status').notNull().default('pending'),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /**
     * In-progress answer, saved on blur (Stage 6). 1:1 with the
     * assignment it belongs to — the same category of mutable progress
     * state as fulfilmentStatus/viewedAt, not a separate table. Cleared
     * in the same transaction as the eventual submit.
     */
    draftValue: jsonb('draft_value'),
    draftUpdatedAt: timestamp('draft_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assignment_requirement_id_idx').on(t.requirementId),
    index('assignment_party_id_idx').on(t.partyId),
  ],
);
