import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actionType, answerFieldType, requirementSensitivity, templateStatus } from './enums';
import { workspace } from './workspace';

export const workflowTemplate = pgTable('workflow_template', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** Archived templates stay for case history but drop out of the picker when instantiating a new case. */
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Immutable once a case references it (Stage 5). Editing a template
 * creates a new version rather than mutating one a live case depends on.
 */
export const templateVersion = pgTable('template_version', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id')
    .notNull()
    .references(() => workflowTemplate.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  status: templateStatus('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const requirementDefinition = pgTable('requirement_definition', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  templateVersionId: uuid('template_version_id')
    .notNull()
    .references(() => templateVersion.id, { onDelete: 'cascade' }),
  actionType: actionType('action_type').notNull(),
  /** Set only when actionType = 'answer' — the five field types from §4.1. */
  answerFieldType: answerFieldType('answer_field_type'),
  title: text('title').notNull(),
  instructions: text('instructions'),
  required: boolean('required').notNull().default(true),
  sequence: integer('sequence').notNull().default(0),
  acceptanceCriteria: text('acceptance_criteria'),
  sensitivity: requirementSensitivity('sensitivity').notNull().default('general'),
  /** Set only when answerFieldType = 'choice' — the list of selectable values (Stage 6). */
  options: jsonb('options').$type<string[] | null>(),
  /**
   * Roadmap seam (not evaluated in Phase 1a): "show requirement B when
   * answer to A equals X" — one hop, evaluated at case instantiation.
   * Deliberately unstructured JSON until conditional logic ships, so the
   * feature costs a reader, not a migration.
   */
  visibilityCondition: jsonb('visibility_condition'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
