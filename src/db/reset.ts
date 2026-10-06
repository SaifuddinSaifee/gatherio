import { sql } from 'drizzle-orm';
import { db } from './client';

/**
 * Dev-only. Truncates every table this app owns, cascading, and restarts
 * identities. Safe here because it only ever runs against the local
 * docker-compose Postgres (DATABASE_URL points at :5434).
 */
const TABLES = [
  'audit_event',
  'delivery_attempt',
  'reminder_dispatch',
  'reminder_policy',
  'signature_envelope',
  'document_validity',
  'review',
  'file_asset',
  'submission_answer',
  'submission_version',
  'assignment',
  'requirement',
  'access_token',
  'party',
  'ledger_subject',
  'case',
  'requirement_definition',
  'template_version',
  'workflow_template',
  'workspace_member',
  'workspace',
  'verification',
  'account',
  'session',
  'user',
];

async function main() {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE;`));
  console.log('Reset: all tables truncated.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
