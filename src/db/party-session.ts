import { eq } from 'drizzle-orm';
import { db } from './client';
import * as schema from './schema';
import { asWorkspaceId, type WorkspaceId } from './scoped';
import { hashAccessToken } from '@/lib/token';

/**
 * Resolves a recipient's magic-link token to a case/party/workspace.
 * Deliberately in src/db (not src/lib), same reasoning as
 * src/db/session.ts: the token-hash lookup is inherently unscoped — the
 * workspace can't be known until the row is found by its hash — so it
 * needs the raw `db` handle, and this file lives under the existing
 * eslint no-restricted-imports carve-out for src/db/** rather than
 * needing a second one.
 *
 * A token grants access to exactly one CASE, not the workspace it lives
 * in — `assignment` has no case_id of its own, so every caller still has
 * to verify `assignment -> requirement.caseId === session.caseId` on top
 * of this. Workspace scoping alone is not authorization here.
 */

export interface RecipientSession {
  accessTokenId: string;
  workspaceId: WorkspaceId;
  caseId: string;
  partyId: string;
}

export type RecipientSessionFailureReason = 'not_found' | 'expired' | 'revoked';

export type ResolveRecipientSessionResult =
  | { ok: true; session: RecipientSession }
  | { ok: false; reason: RecipientSessionFailureReason };

/**
 * READ-ONLY. Writes nothing, ever — no INSERT, UPDATE, or DELETE anywhere
 * in this function. This is where the mail-scanner guarantee (§4.7: a GET
 * against /r/[token] must never consume the token, mark anything viewed,
 * or record consent) actually lives — a corporate scanner pre-fetching a
 * recipient's link runs exactly this code path and nothing else.
 */
export async function resolveRecipientSession(
  rawToken: string,
): Promise<ResolveRecipientSessionResult> {
  const tokenHash = hashAccessToken(rawToken);
  const [row] = await db
    .select()
    .from(schema.accessToken)
    .where(eq(schema.accessToken.tokenHash, tokenHash))
    .limit(1);

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.revokedAt) return { ok: false, reason: 'revoked' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    session: {
      accessTokenId: row.id,
      workspaceId: asWorkspaceId(row.workspaceId),
      caseId: row.caseId,
      partyId: row.partyId,
    },
  };
}

export type AssertTokenStillValidResult = { ok: true } | { ok: false; reason: RecipientSessionFailureReason };

/**
 * Re-reads the access_token row by id. This is the first call inside
 * every recipient server action (via requireRecipient in
 * src/app/r/c/[caseId]/actions.ts) — it's what makes "expiry and
 * revocation enforced on every POST, not just at session creation"
 * (CHECKLIST Stage 6) literally true rather than aspirational. Without
 * it, a signed recipient-session cookie would keep authorizing POSTs
 * right up to its own TTL even after the underlying access_token had
 * been revoked (e.g. via "Revoke & reissue" on the requester side)
 * seconds earlier.
 */
export async function assertTokenStillValid(
  accessTokenId: string,
): Promise<AssertTokenStillValidResult> {
  const [row] = await db
    .select({ revokedAt: schema.accessToken.revokedAt, expiresAt: schema.accessToken.expiresAt })
    .from(schema.accessToken)
    .where(eq(schema.accessToken.id, accessTokenId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.revokedAt) return { ok: false, reason: 'revoked' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true };
}
