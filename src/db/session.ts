import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from './client';
import * as schema from './schema';
import { asWorkspaceId, type WorkspaceId } from './scoped';

export interface CurrentSession {
  userId: string;
  workspaceId: WorkspaceId;
  role: 'owner' | 'member';
}

/**
 * The one choke point every server action and route handler uses to
 * resolve a request to a WorkspaceId. Deliberately in src/db (not
 * src/lib) so it's covered by the existing tenant-isolation ESLint
 * carve-out rather than needing a second one.
 *
 * Returns null on no session OR no workspace membership (both are "not
 * logged in, as far as the app is concerned" — a user without a
 * workspace can only exist mid-way through a failed sign-up).
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;

  const [membership] = await db
    .select({ workspaceId: schema.workspaceMember.workspaceId, role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .where(eq(schema.workspaceMember.userId, result.user.id))
    .limit(1);

  if (!membership) return null;

  return {
    userId: result.user.id,
    workspaceId: asWorkspaceId(membership.workspaceId),
    role: membership.role,
  };
}

export function requireRole(session: CurrentSession, role: 'owner' | 'member'): boolean {
  if (role === 'member') return true; // owner and member can both do member-level actions
  return session.role === 'owner';
}
