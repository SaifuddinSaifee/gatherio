import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import type { WorkspaceId } from './scoped';

type Tx = NodePgDatabase<typeof schema>;

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
