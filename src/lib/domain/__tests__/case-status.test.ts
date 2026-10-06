import { describe, expect, it } from 'vitest';
import {
  deriveCaseStatus,
  deriveItemState,
  type CaseStatusItem,
  type ItemStateInput,
} from '../case-status';

function state(overrides: Partial<ItemStateInput> = {}): ItemStateInput {
  return {
    fulfilmentStatus: 'pending',
    latestKind: null,
    latestReviewStatus: null,
    ...overrides,
  };
}

describe('deriveItemState', () => {
  it('is awaiting_recipient when nothing has been submitted', () => {
    expect(deriveItemState(state())).toBe('awaiting_recipient');
  });

  it('is awaiting_recipient while a draft is in progress with no completed version', () => {
    expect(deriveItemState(state({ fulfilmentStatus: 'in_progress' }))).toBe('awaiting_recipient');
  });

  it('is needs_review for a submitted upload with no decision yet', () => {
    const s = deriveItemState(
      state({ fulfilmentStatus: 'submitted', latestKind: 'file', latestReviewStatus: null }),
    );
    expect(s).toBe('needs_review');
  });

  it('is needs_review for a submitted answer with no decision yet', () => {
    const s = deriveItemState(
      state({ fulfilmentStatus: 'submitted', latestKind: 'short_text', latestReviewStatus: null }),
    );
    expect(s).toBe('needs_review');
  });

  it('is needs_review for a "doesn\'t apply" declaration with no decision yet', () => {
    const s = deriveItemState(
      state({ fulfilmentStatus: 'submitted', latestKind: 'not_applicable', latestReviewStatus: null }),
    );
    expect(s).toBe('needs_review');
  });

  it('auto-accepts an acknowledgement with no review row (decision 7)', () => {
    const s = deriveItemState(
      state({ fulfilmentStatus: 'submitted', latestKind: 'acknowledge', latestReviewStatus: null }),
    );
    expect(s).toBe('accepted');
  });

  it('is accepted when the latest decision is approved', () => {
    const s = deriveItemState(
      state({ fulfilmentStatus: 'submitted', latestKind: 'short_text', latestReviewStatus: 'approved' }),
    );
    expect(s).toBe('accepted');
  });

  it('is changes_requested when the latest decision is changes_requested', () => {
    const s = deriveItemState(
      state({
        fulfilmentStatus: 'in_progress',
        latestKind: 'file',
        latestReviewStatus: 'changes_requested',
      }),
    );
    expect(s).toBe('changes_requested');
  });

  it('is rejected when the latest decision is rejected, and blocks (fails closed)', () => {
    const s = deriveItemState(
      state({ fulfilmentStatus: 'submitted', latestKind: 'file', latestReviewStatus: 'rejected' }),
    );
    expect(s).toBe('rejected');
  });

  it('prefers awaiting_recipient over a stale approved decision when fulfilment is still open', () => {
    // Defensive: an approved decision exists but fulfilment reads as open
    // (e.g. mid-transition) — rule 3 fires before rule 4, so the recipient
    // side of the picture wins rather than showing a false "accepted".
    const s = deriveItemState(
      state({ fulfilmentStatus: 'in_progress', latestKind: 'short_text', latestReviewStatus: 'approved' }),
    );
    expect(s).toBe('awaiting_recipient');
  });

  it('waived and cancelled are terminal regardless of any review', () => {
    expect(
      deriveItemState(state({ fulfilmentStatus: 'waived', latestReviewStatus: 'changes_requested' })),
    ).toBe('waived');
    expect(deriveItemState(state({ fulfilmentStatus: 'cancelled' }))).toBe('cancelled');
  });
});

function item(overrides: Partial<CaseStatusItem> = {}): CaseStatusItem {
  return { required: true, state: 'accepted', ...overrides };
}

describe('deriveCaseStatus', () => {
  it('is complete when there are no items', () => {
    expect(deriveCaseStatus([])).toEqual({
      status: 'complete',
      counts: { accepted: 0, needsReview: 0, changesRequested: 0, awaitingRecipient: 0, required: 0 },
    });
  });

  it('is complete when every required item is accepted', () => {
    const { status, counts } = deriveCaseStatus([
      item({ required: true, state: 'accepted' }),
      item({ required: true, state: 'accepted' }),
    ]);
    expect(status).toBe('complete');
    expect(counts).toEqual({
      accepted: 2,
      needsReview: 0,
      changesRequested: 0,
      awaitingRecipient: 0,
      required: 2,
    });
  });

  it('an untouched optional item does not block completion', () => {
    const { status } = deriveCaseStatus([
      item({ required: true, state: 'accepted' }),
      item({ required: false, state: 'awaiting_recipient' }),
    ]);
    expect(status).toBe('complete');
  });

  it('a submitted optional item (needs_review) does block completion', () => {
    const { status, counts } = deriveCaseStatus([
      item({ required: true, state: 'accepted' }),
      item({ required: false, state: 'needs_review' }),
    ]);
    expect(status).toBe('needs_review');
    expect(counts.needsReview).toBe(1);
  });

  it('a required awaiting_recipient item blocks with status awaiting_recipient', () => {
    const { status } = deriveCaseStatus([item({ required: true, state: 'awaiting_recipient' })]);
    expect(status).toBe('awaiting_recipient');
  });

  it('a changes_requested item blocks with status awaiting_recipient (it is the recipient\'s move)', () => {
    const { status, counts } = deriveCaseStatus([
      item({ required: true, state: 'accepted' }),
      item({ required: true, state: 'changes_requested' }),
    ]);
    expect(status).toBe('awaiting_recipient');
    expect(counts.changesRequested).toBe(1);
  });

  it('needs_review outranks awaiting_recipient when both are present', () => {
    const { status } = deriveCaseStatus([
      item({ required: true, state: 'needs_review' }),
      item({ required: true, state: 'awaiting_recipient' }),
    ]);
    expect(status).toBe('needs_review');
  });

  it('a rejected item blocks (fails closed) even though it is unreachable today', () => {
    const { status } = deriveCaseStatus([
      item({ required: true, state: 'accepted' }),
      item({ required: true, state: 'rejected' }),
    ]);
    expect(status).not.toBe('complete');
  });

  it('counts.required and counts.accepted are scoped to required items only', () => {
    const { counts } = deriveCaseStatus([
      item({ required: true, state: 'accepted' }),
      item({ required: false, state: 'accepted' }),
      item({ required: true, state: 'needs_review' }),
    ]);
    // 1 of 2 required items accepted — the optional accepted item doesn't
    // inflate either the numerator or the denominator.
    expect(counts.required).toBe(2);
    expect(counts.accepted).toBe(1);
  });
});
