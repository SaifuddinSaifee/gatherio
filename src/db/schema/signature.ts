import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { signatureStatus } from './enums';
import { workspace } from './workspace';
import { requirement } from './requirement';
import { fileAsset } from './submission';

/**
 * Phase 2 (roadmap seams). Table exists now so adding provider-backed
 * signing later is a renderer + webhook handler, not a migration. Mirrors
 * provider state; never reproduces the provider's legal model (§7).
 */
export const signatureEnvelope = pgTable('signature_envelope', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  requirementId: uuid('requirement_id')
    .notNull()
    .references(() => requirement.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerEnvelopeId: text('provider_envelope_id'),
  documentHash: text('document_hash'),
  signatureStatus: signatureStatus('signature_status').notNull().default('not_sent'),
  completedDocumentAssetId: uuid('completed_document_asset_id').references(() => fileAsset.id),
  evidenceAssetId: uuid('evidence_asset_id').references(() => fileAsset.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
