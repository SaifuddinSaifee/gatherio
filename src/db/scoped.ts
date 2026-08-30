import { and, eq, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from './client';
import * as schema from './schema';

/**
 * Branded so a raw string can't be passed where a checked workspace id is
 * required — the caller must have actually resolved it (session, party
 * token) rather than trusted a client-supplied value.
 */
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

export function asWorkspaceId(id: string): WorkspaceId {
  return id as WorkspaceId;
}

/**
 * The only sanctioned way to read or write workspace-scoped tables
 * (enforced by eslint.config.mjs's no-restricted-imports rule on the raw
 * `db` export). techstack.md: "a solo builder will eventually forget a
 * WHERE clause. Make the forgetting harmless." `where()` folds the
 * workspace filter into the query condition so a call site can still
 * forget everything else but not that.
 *
 * Deliberately a thin wrapper, not a query builder abstraction: it
 * forwards to Drizzle for the actual query and only owns the scoping
 * condition, so it doesn't grow into a second ORM.
 *
 * Usage: `scoped(workspaceId).where(schema.case.workspaceId, eq(schema.case.id, caseId))`
 */
export function scoped(workspaceId: WorkspaceId) {
  return {
    workspaceId,
    db,
    schema,
    where(workspaceIdColumn: AnyPgColumn, extra?: SQL): SQL {
      const scopeCondition = eq(workspaceIdColumn, workspaceId);
      return extra ? and(scopeCondition, extra)! : scopeCondition;
    },
  };
}

export type Scoped = ReturnType<typeof scoped>;
