import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authLevel } from './enums';
import { workspace } from './workspace';
import { caseTable, party } from './case';

/**
 * Magic-link tokens. Store the hash, never the token (§4.7,
 * techstack.md) — a leaked DB row must not be a usable link. A GET
 * against /r/[token] must never consume or mark this used; only an
 * explicit POST from the session it creates does that (Stage 6).
 */
export const accessToken = pgTable(
  'access_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => caseTable.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => party.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    authLevel: authLevel('auth_level').notNull().default('link'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('access_token_case_id_idx').on(t.caseId)],
);
