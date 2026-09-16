/**
 * Pure dashboard shaping (Stage 8.5) — filtering and sorting take
 * `DashboardCase[]` (case.ts's `listCases`) and do no I/O, so they're
 * unit-tested without a database, the same split as case-status.ts.
 */

import type { DashboardCase } from './case';

export const DASHBOARD_FILTERS = ['all', 'needs_review', 'awaiting_recipient', 'complete'] as const;
export type DashboardFilter = (typeof DASHBOARD_FILTERS)[number];

export function parseDashboardFilter(raw: string | null | undefined): DashboardFilter {
  return (DASHBOARD_FILTERS as readonly string[]).includes(raw ?? '')
    ? (raw as DashboardFilter)
    : 'all';
}

export function matchesDashboardFilter(row: DashboardCase, filter: DashboardFilter): boolean {
  if (filter === 'all') return true;
  return row.status === filter;
}

export interface DashboardFilterCounts {
  all: number;
  needs_review: number;
  awaiting_recipient: number;
  complete: number;
}

export function filterCounts(rows: readonly DashboardCase[]): DashboardFilterCounts {
  const counts: DashboardFilterCounts = { all: rows.length, needs_review: 0, awaiting_recipient: 0, complete: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/**
 * Needs-your-review cases first (the requester's own move), oldest
 * recipient activity first within that group so the longest-waiting
 * review surfaces at the top. Then awaiting-recipient, never-contacted
 * cases before ones that have already been nudged, then by oldest
 * contact. Complete cases last, most recently completed first.
 */
export function sortForDashboard(rows: readonly DashboardCase[]): DashboardCase[] {
  const rank: Record<DashboardCase['status'], number> = {
    needs_review: 0,
    awaiting_recipient: 1,
    complete: 2,
  };

  return [...rows].sort((a, b) => {
    const rankDiff = rank[a.status] - rank[b.status];
    if (rankDiff !== 0) return rankDiff;

    if (a.status === 'complete') {
      const aCompleted = a.case.completedAt?.getTime() ?? 0;
      const bCompleted = b.case.completedAt?.getTime() ?? 0;
      return bCompleted - aCompleted;
    }

    if (a.status === 'needs_review') {
      const aActivity = a.lastRecipientActivity?.occurredAt.getTime() ?? a.case.createdAt.getTime();
      const bActivity = b.lastRecipientActivity?.occurredAt.getTime() ?? b.case.createdAt.getTime();
      return aActivity - bActivity;
    }

    // awaiting_recipient: never-contacted first, then oldest contact first.
    const aContact = a.lastContact?.createdAt.getTime() ?? -Infinity;
    const bContact = b.lastContact?.createdAt.getTime() ?? -Infinity;
    return aContact - bContact;
  });
}
