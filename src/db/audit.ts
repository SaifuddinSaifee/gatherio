import * as schema from './schema';
import type { Database } from './client';
import type { WorkspaceId } from './scoped';

/**
 * The actual type `db.transaction(async (tx) => ...)` hands its callback
 * — derived structurally from Database['transaction'] rather than
 * hand-typed as NodePgDatabase<typeof schema>. The two look like they
 * should be the same thing but aren't: a transaction handle is missing
 * the `$client: Pool` property NodePgDatabase requires, which is a type
 * error at every real call site (caught when Stage 6 became the first
 * caller of withAudit — nothing had exercised this signature before).
 * Deriving it this way means a future drizzle-orm version can't silently
 * reintroduce the same mismatch.
 *
 * Exported (Stage 7) so every domain module shares one definition instead
 * of redeclaring it locally — `submission.ts` used to have its own copy.
 */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface AuditEventInput {
  workspaceId: WorkspaceId;
  caseId?: string;
  actorType: 'user' | 'party' | 'system';
  actorId?: string;
  eventType: string;
  objectType: string;
  objectId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes the audit row using the same transaction handle as the state
 * change it describes (techstack.md: "not a background write, not a log
 * line. Same commit or it did not happen."). Callers open the transaction
 * themselves and pass its `tx` here alongside their own writes:
 *
 *   await db.transaction(async (tx) => {
 *     await tx.update(schema.assignment).set({...}).where(...);
 *     await withAudit(tx, { workspaceId, eventType: 'assignment.approved', ... });
 *   });
 */
export async function withAudit(tx: Tx, event: AuditEventInput): Promise<void> {
  await tx.insert(schema.auditEvent).values({
    workspaceId: event.workspaceId,
    caseId: event.caseId,
    actorType: event.actorType,
    actorId: event.actorId,
    eventType: event.eventType,
    objectType: event.objectType,
    objectId: event.objectId,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    metadata: event.metadata,
  });
}
