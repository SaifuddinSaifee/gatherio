import { eq } from 'drizzle-orm';
import { db } from './client';
import * as schema from './schema';
import { asWorkspaceId, type WorkspaceId } from './scoped';

/**
 * Creates a workspace and its owner membership in one transaction. Called
 * as the second step of sign-up, after Better Auth has already committed
 * the user row — not something our transaction can span, since that's a
 * separate library's internal commit. If this throws, the caller is
 * expected to compensate via deleteOrphanedUser.
 */
export async function createWorkspaceForUser(
  userId: string,
  workspaceName: string,
): Promise<WorkspaceId> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx.insert(schema.workspace).values({ name: workspaceName }).returning();
    if (!workspace) throw new Error('Failed to create workspace.');

    await tx.insert(schema.workspaceMember).values({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    });

    return asWorkspaceId(workspace.id);
  });
}

/** Compensating action when workspace creation fails after the user was already created. */
export async function deleteOrphanedUser(userId: string): Promise<void> {
  await db.delete(schema.user).where(eq(schema.user.id, userId));
}

/**
 * Looks up the workspace row itself by id. Deliberately separate from
 * scoped(): scoped()'s where() helper ANDs in a workspace_id = ? filter
 * for child tables, but `workspace` is the root table — it has no such
 * column, it *is* the thing being scoped to. Callers outside src/db/
 * (e.g. the dashboard page) go through this rather than reaching for
 * `db` directly.
 */
export async function getWorkspaceById(
  workspaceId: WorkspaceId,
): Promise<{ id: string; name: string } | null> {
  const [workspace] = await db
    .select({ id: schema.workspace.id, name: schema.workspace.name })
    .from(schema.workspace)
    .where(eq(schema.workspace.id, workspaceId))
    .limit(1);
  return workspace ?? null;
}
