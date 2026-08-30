import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { malwareScanStatus, reviewStatus, validityStatus } from './enums';
import { workspace } from './workspace';
import { assignment } from './requirement';
import { ledgerSubject, party } from './case';
import { user } from './auth';

/**
 * Never overwritten (§5, §4.3). Each resubmission is a new row pointing
 * at its predecessor via supersedes_submission_id — the audit history and
 * the rework loop both depend on nothing being mutated in place.
 */
export const submissionVersion = pgTable('submission_version', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => assignment.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  submittedByPartyId: uuid('submitted_by_party_id')
    .notNull()
    .references(() => party.id),
  supersedesSubmissionId: uuid('supersedes_submission_id'),
});

/** Structured answers for `action_type = 'answer'` requirements — five field types only (§4.1). */
export const submissionAnswer = pgTable('submission_answer', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  submissionVersionId: uuid('submission_version_id')
    .notNull()
    .references(() => submissionVersion.id, { onDelete: 'cascade' }),
  value: jsonb('value').notNull(),
});

export const fileAsset = pgTable('file_asset', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  submissionVersionId: uuid('submission_version_id')
    .notNull()
    .references(() => submissionVersion.id, { onDelete: 'cascade' }),
  /** Format fixed at {workspace_id}/{case_id}/{submission_version_id}/{uuid} (techstack.md) — never the original filename. */
  storageKey: text('storage_key').notNull().unique(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  sha256Hash: text('sha256_hash').notNull(),
  malwareScanStatus: malwareScanStatus('malware_scan_status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `reason` is structured input to the next reminder for this assignment,
 * not a note (§5) — the rework loop is a first-class event, not a status
 * flag. See src/lib/domain for how it's threaded into reminder copy.
 */
export const review = pgTable('review', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  submissionVersionId: uuid('submission_version_id')
    .notNull()
    .references(() => submissionVersion.id, { onDelete: 'cascade' }),
  reviewStatus: reviewStatus('review_status').notNull().default('unreviewed'),
  reviewedBy: text('reviewed_by').references(() => user.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reason: text('reason'),
});

/** Anchored to a subject (§4.3), not to the requirement that happened to collect it — the carry-forward mechanism. */
export const documentValidity = pgTable('document_validity', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  submissionVersionId: uuid('submission_version_id')
    .notNull()
    .references(() => submissionVersion.id, { onDelete: 'cascade' }),
  ledgerSubjectId: uuid('ledger_subject_id')
    .notNull()
    .references(() => ledgerSubject.id),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  validityStatus: validityStatus('validity_status').notNull().default('not_applicable'),
  responsibleUserId: text('responsible_user_id').references(() => user.id),
  renewalCaseId: uuid('renewal_case_id'),
});
