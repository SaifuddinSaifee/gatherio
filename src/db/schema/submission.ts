import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
 *
 * `supersedesSubmissionId` is set only when a version becomes *completed*
 * (Stage 7): at insert for an answer, and inside `finalizeUpload`'s locked
 * transaction for an upload, since a bare reservation isn't a submission
 * until that transaction commits. It is never changed afterwards — the
 * self-FK exists so the chain is provably linear, not to support editing it.
 */
export const submissionVersion = pgTable(
  'submission_version',
  {
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
  },
  (t) => [
    /**
     * Makes the max(version_number)+1 race fail loudly instead of
     * silently duplicating (Stage 6: two concurrent uploads reserving a
     * version for the same assignment). Gaps from an abandoned upload
     * stay legal — only duplicates are ruled out.
     */
    uniqueIndex('submission_version_assignment_id_version_number_key').on(
      t.assignmentId,
      t.versionNumber,
    ),
    // Named explicitly — the default drizzle-kit-generated name for a
    // self-referencing FK on this table exceeds Postgres's 63-byte
    // identifier limit and would be silently truncated.
    foreignKey({
      name: 'submission_version_supersedes_fk',
      columns: [t.supersedesSubmissionId],
      foreignColumns: [t.id],
    }).onDelete('set null'),
  ],
);

/** Structured answers for `action_type = 'answer'` requirements — five field types only (§4.1). */
export const submissionAnswer = pgTable(
  'submission_answer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    submissionVersionId: uuid('submission_version_id')
      .notNull()
      .references(() => submissionVersion.id, { onDelete: 'cascade' }),
    value: jsonb('value').notNull(),
  },
  (t) => [index('submission_answer_submission_version_id_idx').on(t.submissionVersionId)],
);

export const fileAsset = pgTable(
  'file_asset',
  {
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
  },
  (t) => [index('file_asset_submission_version_id_idx').on(t.submissionVersionId)],
);

/**
 * `reason` is structured input to the next reminder for this assignment,
 * not a note (§5) — the rework loop is a first-class event, not a status
 * flag. See src/lib/domain for how it's threaded into reminder copy.
 *
 * Stage 7: a row here is an insert-only decision, never mutated or
 * "corrected" in place. "Unreviewed" is derived (the latest completed
 * submission_version has no review row) rather than stored — the
 * `review_status` enum still carries `not_required`/`unreviewed` for
 * roadmap compatibility with product.md, but no Stage 7 write path ever
 * inserts either value; the CHECK below enforces that at the database.
 * `reviewNumber` (max+1 per version, assigned under the assignment's row
 * lock) orders decisions when a version is reviewed more than once
 * (reopen / approve-as-is) — `reviewedAt` can't do this safely, because
 * Postgres's `now()` is transaction-start time, not commit time, so a
 * reviewer blocked on the lock can commit later with an earlier
 * timestamp than the decision it's revising.
 */
export const review = pgTable(
  'review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    submissionVersionId: uuid('submission_version_id')
      .notNull()
      .references(() => submissionVersion.id, { onDelete: 'cascade' }),
    /** Per-version decision sequence — also the optimistic-concurrency token review actions require from the client. */
    reviewNumber: integer('review_number').notNull(),
    reviewStatus: reviewStatus('review_status').notNull(),
    reviewedBy: text('reviewed_by').references(() => user.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    reason: text('reason'),
  },
  (t) => [
    uniqueIndex('review_submission_version_id_review_number_key').on(
      t.submissionVersionId,
      t.reviewNumber,
    ),
    check(
      'review_status_decision',
      sql`${t.reviewStatus} IN ('approved', 'changes_requested', 'rejected')`,
    ),
    check(
      'review_reason_required',
      sql`${t.reviewStatus} = 'approved' OR (${t.reason} IS NOT NULL AND btrim(${t.reason}) <> '')`,
    ),
  ],
);

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
