/**
 * Splits a case's items into "outstanding" and "completed" for the
 * recipient page (§4.4: outstanding first and prominent, completed
 * collapsed beneath and expandable). Pure and DB-free — takes whatever
 * shape src/lib/domain/recipient-view.ts produces, so it's testable
 * without a database.
 */

const OUTSTANDING_FULFILMENT_STATUSES = new Set(['pending', 'viewed', 'in_progress']);

export interface RecipientItemLike {
  requirement: { sequence: number };
  assignment: {
    fulfilmentStatus: 'pending' | 'viewed' | 'in_progress' | 'submitted' | 'waived' | 'cancelled';
    submittedAt: Date | null;
  };
  latestReview: { reviewStatus: string } | null;
}

/**
 * Outstanding = a fulfilment status that still needs recipient action, OR
 * (regardless of fulfilment status) the latest review came back
 * `changes_requested`. That `OR` is deliberate: it's the only place
 * Stage 6 and Stage 7 touch, and it keeps this page correct no matter
 * what Stage 7 eventually does to fulfilmentStatus when it reopens an
 * assignment — the review outcome is the tie-breaker either way.
 */
function isOutstanding(item: RecipientItemLike): boolean {
  if (item.latestReview?.reviewStatus === 'changes_requested') return true;
  return OUTSTANDING_FULFILMENT_STATUSES.has(item.assignment.fulfilmentStatus);
}

export function partitionItems<T extends RecipientItemLike>(
  items: T[],
): { outstanding: T[]; completed: T[] } {
  const outstanding: T[] = [];
  const completed: T[] = [];

  for (const item of items) {
    (isOutstanding(item) ? outstanding : completed).push(item);
  }

  outstanding.sort((a, b) => a.requirement.sequence - b.requirement.sequence);
  completed.sort((a, b) => {
    const aTime = a.assignment.submittedAt?.getTime() ?? 0;
    const bTime = b.assignment.submittedAt?.getTime() ?? 0;
    return bTime - aTime; // most recently submitted first
  });

  return { outstanding, completed };
}
