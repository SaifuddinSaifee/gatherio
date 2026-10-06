/**
 * Pure dashboard shaping (Stage 8.5) — sorting takes `DashboardCase[]`
 * (case.ts's `listCases`) and does no I/O, so it's unit-tested without a
 * database, the same split as case-status.ts. Filtering lives in
 * dashboard-table.ts, shared by the table and list views.
 */

import type { DashboardCase } from './case';

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
