import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Five independent status axes (product doc §4.2). A document can be
 * simultaneously submitted, approved, expiring, and delivered by a
 * bounced-free email — these are not one enum, they are five columns.
 */
export const fulfilmentStatus = pgEnum('fulfilment_status', [
  'pending',
  'viewed',
  'in_progress',
  'submitted',
  'waived',
  'cancelled',
]);

export const reviewStatus = pgEnum('review_status', [
  'not_required',
  'unreviewed',
  'approved',
  'changes_requested',
  'rejected',
]);

export const validityStatus = pgEnum('validity_status', [
  'not_applicable',
  'current',
  'expiring',
  'expired',
]);

export const deliveryStatus = pgEnum('delivery_status', [
  'queued',
  'sent',
  'delivered',
  'bounced',
  'suppressed',
  // Stage 8.5: the provider refused the send outright (SMTP error) — not
  // a bounce, which is an asynchronous report about an accepted message.
  'failed',
]);

/**
 * Why a reminder_dispatch row exists (Stage 8.5, product.md §5). Only
 * `scheduled` rows occupy a slot in the (assignment_id, reminder_sequence)
 * idempotency sequence; a requester's manual send is its own row.
 */
export const reminderTrigger = pgEnum('reminder_trigger', ['scheduled', 'manual', 'conditional']);

export const signatureStatus = pgEnum('signature_status', [
  'not_sent',
  'opened',
  'signed',
  'declined',
  'voided',
  'expired',
]);

/** upload | answer | acknowledge ship in Phase 1a; sign is Phase 2 (§4.1, roadmap seams). */
export const actionType = pgEnum('action_type', ['upload', 'answer', 'sign', 'acknowledge']);

/** Five field types only (§4.1) — not a form builder. */
export const answerFieldType = pgEnum('answer_field_type', [
  'short_text',
  'long_text',
  'date',
  'choice',
  'yes_no',
]);

export const partyType = pgEnum('party_type', ['individual', 'organization']);

export const workspaceRole = pgEnum('workspace_role', ['owner', 'member']);

export const templateStatus = pgEnum('template_status', ['draft', 'active', 'archived']);

export const malwareScanStatus = pgEnum('malware_scan_status', [
  'pending',
  'quarantined',
  'clean',
  'infected',
  'scan_failed',
]);

/**
 * §4.7's risk ladder. Phase 1a only ever issues `link`; the rest exist so
 * step-up auth (banking details, Aadhaar eSign) is a policy lookup later,
 * not a migration under deadline.
 */
export const authLevel = pgEnum('auth_level', [
  'link',
  'link_email_reverify',
  'link_otp',
  'otp_out_of_band',
]);

export const requirementSensitivity = pgEnum('requirement_sensitivity', [
  'general',
  'routine_business',
  'tax_identity',
  'banking',
  'high_value_agreement',
]);
