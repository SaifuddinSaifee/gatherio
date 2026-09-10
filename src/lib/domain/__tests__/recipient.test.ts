import { describe, expect, it } from 'vitest';
import { partitionItems, type RecipientItemLike } from '../recipient';

function item(overrides: Partial<RecipientItemLike> = {}): RecipientItemLike {
  return {
    requirement: { sequence: 0 },
    assignment: { fulfilmentStatus: 'pending', submittedAt: null },
    latestReview: null,
    ...overrides,
  };
}

describe('partitionItems', () => {
  it('returns empty arrays for an empty case', () => {
    expect(partitionItems([])).toEqual({ outstanding: [], completed: [] });
  });

  it('puts pending/viewed/in_progress in outstanding', () => {
    const pending = item({ assignment: { fulfilmentStatus: 'pending', submittedAt: null } });
    const viewed = item({ assignment: { fulfilmentStatus: 'viewed', submittedAt: null } });
    const inProgress = item({ assignment: { fulfilmentStatus: 'in_progress', submittedAt: null } });
    const { outstanding, completed } = partitionItems([pending, viewed, inProgress]);
    expect(outstanding).toHaveLength(3);
    expect(completed).toHaveLength(0);
  });

  it('puts submitted/waived/cancelled in completed', () => {
    const submitted = item({
      assignment: { fulfilmentStatus: 'submitted', submittedAt: new Date('2026-01-01') },
    });
    const waived = item({ assignment: { fulfilmentStatus: 'waived', submittedAt: null } });
    const cancelled = item({ assignment: { fulfilmentStatus: 'cancelled', submittedAt: null } });
    const { outstanding, completed } = partitionItems([submitted, waived, cancelled]);
    expect(outstanding).toHaveLength(0);
    expect(completed).toHaveLength(3);
  });

  it('treats changes_requested as outstanding even when fulfilmentStatus is submitted', () => {
    const changesRequested = item({
      assignment: { fulfilmentStatus: 'submitted', submittedAt: new Date('2026-01-01') },
      latestReview: { reviewStatus: 'changes_requested' },
    });
    const { outstanding, completed } = partitionItems([changesRequested]);
    expect(outstanding).toHaveLength(1);
    expect(completed).toHaveLength(0);
  });

  it('treats an approved review on a submitted item as completed', () => {
    const approved = item({
      assignment: { fulfilmentStatus: 'submitted', submittedAt: new Date('2026-01-01') },
      latestReview: { reviewStatus: 'approved' },
    });
    const { outstanding, completed } = partitionItems([approved]);
    expect(outstanding).toHaveLength(0);
    expect(completed).toHaveLength(1);
  });

  it('sorts outstanding items by requirement sequence ascending', () => {
    const third = item({ requirement: { sequence: 2 } });
    const first = item({ requirement: { sequence: 0 } });
    const second = item({ requirement: { sequence: 1 } });
    const { outstanding } = partitionItems([third, first, second]);
    expect(outstanding.map((i) => i.requirement.sequence)).toEqual([0, 1, 2]);
  });

  it('sorts completed items by submittedAt descending (most recent first)', () => {
    const older = item({
      assignment: { fulfilmentStatus: 'submitted', submittedAt: new Date('2026-01-01') },
    });
    const newer = item({
      assignment: { fulfilmentStatus: 'submitted', submittedAt: new Date('2026-03-01') },
    });
    const { completed } = partitionItems([older, newer]);
    expect(completed[0]).toBe(newer);
    expect(completed[1]).toBe(older);
  });

  it('sorts a completed item with no submittedAt (e.g. waived) as oldest', () => {
    const waivedNoDate = item({ assignment: { fulfilmentStatus: 'waived', submittedAt: null } });
    const submitted = item({
      assignment: { fulfilmentStatus: 'submitted', submittedAt: new Date('2026-01-01') },
    });
    const { completed } = partitionItems([waivedNoDate, submitted]);
    expect(completed[0]).toBe(submitted);
    expect(completed[1]).toBe(waivedNoDate);
  });
});
