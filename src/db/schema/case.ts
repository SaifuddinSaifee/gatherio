import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { partyType } from './enums';
import { workspace } from './workspace';
import { templateVersion } from './template';
import { user } from './auth';

export const caseTable = pgTable('case', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  templateVersionId: uuid('template_version_id')
    .notNull()
    .references(() => templateVersion.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A subject a document's validity is anchored to (§4.3) — a vendor,
 * worker, property, or project. Independent of any one case, which is
 * what makes carry-forward possible: a recurring case can ask "does this
 * subject already hold a current document of this type?" before asking
 * the party to upload anything.
 */
export const ledgerSubject = pgTable('ledger_subject', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  subjectType: text('subject_type').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** An external person or organization. Never gets an account (the core thesis). */
export const party = pgTable('party', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  caseId: uuid('case_id')
    .notNull()
    .references(() => caseTable.id, { onDelete: 'cascade' }),
  partyType: partyType('party_type').notNull().default('individual'),
  displayName: text('display_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  organizationName: text('organization_name'),
  /** Lets a party persist across recurring cases (§5) — required for carry-forward. */
  ledgerSubjectId: uuid('ledger_subject_id').references(() => ledgerSubject.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
