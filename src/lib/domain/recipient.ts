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
 * `changes_requested`. Stage 7's `requestChanges` does set fulfilment
 * back to `in_progress` when it reopens an assignment (src/lib/domain/
 * review.ts, decision 3), so the fulfilment-status branch alone is
 * enough in practice today. The `OR` on the review outcome stays as
 * belt-and-braces — this page shouldn't have to assume every future
 * writer of `fulfilmentStatus` gets that transition right.
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
