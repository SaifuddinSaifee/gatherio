import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DashboardCase } from '../case';
import {
  DEFAULT_TABLE_STATE,
  EMPTY_FILTERS,
  caseFlags,
  caseTableStateToSearchParams,
  facetCounts,
  filterCaseRows,
  hasActiveFilters,
  parseCaseTableState,
  toCaseTableRow,
  type CaseTableRow,
} from '../dashboard-table';

const NOW = new Date('2026-09-16T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function dashboardCase(overrides: Partial<DashboardCase> = {}, caseOverrides: Partial<DashboardCase['case']> = {}): DashboardCase {
  return {
    case: {
      id: randomUUID(),
      workspaceId: randomUUID(),
      templateVersionId: randomUUID(),
      name: 'Q3 Close: Acme Traders',
      dueAt: null,
      createdBy: randomUUID(),
      completedAt: null,
      createdAt: new Date(NOW.getTime() - 3 * DAY),
      ...caseOverrides,
    },
    templateName: 'Monthly Close',
    party: null,
    totalRequirements: 2,
    status: 'awaiting_recipient',
    counts: { accepted: 0, needsReview: 0, changesRequested: 0, awaitingRecipient: 2, required: 2 },
    blockingItems: [],
    lastRecipientActivity: null,
    lastContact: null,
    lastReminderAt: null,
    reminder: { ok: true },
    ...overrides,
  };
}

function row(overrides: Partial<CaseTableRow> = {}): CaseTableRow {
  return { ...toCaseTableRow(dashboardCase(), NOW), ...overrides };
}

describe('caseFlags', () => {
  it('flags an open case past its due date as overdue, not due soon', () => {
    const flags = caseFlags(dashboardCase({}, { dueAt: new Date(NOW.getTime() - DAY) }), NOW);
    expect(flags).toContain('overdue');
    expect(flags).not.toContain('due_soon');
  });

  it('flags due within 7 days as due soon, and nothing further out', () => {
    expect(caseFlags(dashboardCase({}, { dueAt: new Date(NOW.getTime() + 7 * DAY) }), NOW)).toContain('due_soon');
    expect(caseFlags(dashboardCase({}, { dueAt: new Date(NOW.getTime() + 8 * DAY) }), NOW)).not.toContain('due_soon');
  });

  it('never flags a complete case as overdue or unopened', () => {
    const flags = caseFlags(
      dashboardCase({ status: 'complete' }, { dueAt: new Date(NOW.getTime() - DAY) }),
      NOW,
    );
    expect(flags).not.toContain('overdue');
    expect(flags).not.toContain('never_opened');
  });

  it('flags an unopened link, a failed last email, and changes requested', () => {
    const flags = caseFlags(
      dashboardCase({
        lastContact: { createdAt: NOW, status: 'failed', templateRef: 'case_reminder_unopened' },
        counts: { accepted: 0, needsReview: 0, changesRequested: 1, awaitingRecipient: 1, required: 2 },
      }),
      NOW,
    );
    expect(flags).toEqual(expect.arrayContaining(['never_opened', 'email_failed', 'changes_requested']));
  });
});

describe('toCaseTableRow', () => {
  it('flattens the recipient, activity label, and contact kind', () => {
    const mapped = toCaseTableRow(
      dashboardCase({
        party: {
          id: randomUUID(),
          workspaceId: randomUUID(),
          caseId: randomUUID(),
          partyType: 'individual',
          displayName: 'Priya Sharma',
          email: 'priya@example.com',
          phone: null,
          organizationName: 'Acme Traders',
          ledgerSubjectId: null,
        } as NonNullable<DashboardCase['party']>,
        lastRecipientActivity: { eventType: 'assignment.submitted', occurredAt: NOW },
        lastContact: { createdAt: NOW, status: 'sent', templateRef: 'case_invite' },
      }),
      NOW,
    );
    expect(mapped.recipient).toEqual({ name: 'Priya Sharma', organization: 'Acme Traders', email: 'priya@example.com' });
    expect(mapped.lastActivity?.label).toBe('Submitted an item');
    expect(mapped.lastContact).toEqual({ kind: 'invite', failed: false, at: NOW });
    expect(mapped.daysOpen).toBe(3);
  });
});

describe('filterCaseRows', () => {
  const acme = row({ id: 'acme', name: 'Q3 Close: Acme', templateName: 'Monthly Close', status: 'awaiting_recipient', flags: ['overdue'], recipient: { name: 'Priya Sharma', organization: 'Acme Traders', email: 'priya@acme.test' } });
  const globex = row({ id: 'globex', name: 'Vendor pack: Globex', templateName: 'Vendor Onboarding', status: 'needs_review', flags: ['changes_requested'], recipient: { name: 'Hank Scorpio', organization: null, email: 'hank@globex.test' } });
  const initech = row({ id: 'initech', name: 'Q3 Close: Initech', templateName: 'Monthly Close', status: 'complete', flags: [], recipient: null });
  const rows = [acme, globex, initech];
  const ids = (list: CaseTableRow[]) => list.map((r) => r.id);

  it('returns everything with no filters', () => {
    expect(ids(filterCaseRows(rows, EMPTY_FILTERS))).toEqual(['acme', 'globex', 'initech']);
  });

  it('searches case name, template, recipient name, organization, and email, case-insensitively', () => {
    expect(ids(filterCaseRows(rows, { ...EMPTY_FILTERS, query: 'q3 close' }))).toEqual(['acme', 'initech']);
    expect(ids(filterCaseRows(rows, { ...EMPTY_FILTERS, query: 'VENDOR ONBOARD' }))).toEqual(['globex']);
    expect(ids(filterCaseRows(rows, { ...EMPTY_FILTERS, query: 'priya' }))).toEqual(['acme']);
    expect(ids(filterCaseRows(rows, { ...EMPTY_FILTERS, query: 'acme traders' }))).toEqual(['acme']);
    expect(ids(filterCaseRows(rows, { ...EMPTY_FILTERS, query: 'hank@globex' }))).toEqual(['globex']);
    expect(ids(filterCaseRows(rows, { ...EMPTY_FILTERS, query: '   ' }))).toEqual(['acme', 'globex', 'initech']);
  });

  it('ORs options within a facet and ANDs across facets', () => {
    expect(ids(filterCaseRows(rows, { ...EMPTY_FILTERS, statuses: ['needs_review', 'complete'] }))).toEqual(['globex', 'initech']);
    expect(
      ids(filterCaseRows(rows, { ...EMPTY_FILTERS, statuses: ['awaiting_recipient', 'complete'], templates: ['Monthly Close'], flags: ['overdue'] })),
    ).toEqual(['acme']);
    expect(ids(filterCaseRows(rows, { ...EMPTY_FILTERS, flags: ['overdue', 'changes_requested'] }))).toEqual(['acme', 'globex']);
  });

  it('counts each facet against every other active filter, but not itself', () => {
    const facets = facetCounts(rows, { ...EMPTY_FILTERS, statuses: ['complete'], templates: ['Monthly Close'] });
    // Status counts ignore the status filter but respect the template filter.
    expect(facets.statuses).toEqual({ needs_review: 0, awaiting_recipient: 1, complete: 1 });
    // Template counts ignore the template filter but respect the status filter; every template stays listed.
    expect(facets.templates).toEqual([
      { name: 'Monthly Close', count: 1 },
      { name: 'Vendor Onboarding', count: 0 },
    ]);
    expect(facets.flags.overdue).toBe(0);
  });

  it('knows when any filter is active', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, flags: ['overdue'] })).toBe(true);
  });
});

describe('table URL state', () => {
  it('parses to the defaults when empty', () => {
    expect(parseCaseTableState({})).toEqual(DEFAULT_TABLE_STATE);
    expect(caseTableStateToSearchParams(DEFAULT_TABLE_STATE).toString()).toBe('');
  });

  it('round-trips every field, including template names with commas and a one-based page', () => {
    const state = {
      query: 'acme',
      statuses: ['needs_review' as const, 'complete' as const],
      templates: ['Close, monthly', 'Vendor Onboarding'],
      flags: ['overdue' as const],
      sort: { id: 'dueAt' as const, desc: true },
      page: 2,
      pageSize: 50 as const,
    };
    const params = caseTableStateToSearchParams(state);
    expect(params.get('page')).toBe('3');
    expect(parseCaseTableState(new URLSearchParams(params.toString()))).toEqual(state);
  });

  it('accepts Next.js searchParams objects with single or repeated values', () => {
    const state = parseCaseTableState({ status: 'complete', flag: ['overdue', 'email_failed'], sort: 'name.asc' });
    expect(state.statuses).toEqual(['complete']);
    expect(state.flags).toEqual(['overdue', 'email_failed']);
    expect(state.sort).toEqual({ id: 'name', desc: false });
  });

  it('drops unknown or malformed values instead of trusting them', () => {
    const state = parseCaseTableState(
      new URLSearchParams('status=bogus&status=complete&status=complete&flag=nope&sort=password.desc&page=-4&size=1000'),
    );
    expect(state.statuses).toEqual(['complete']);
    expect(state.flags).toEqual([]);
    expect(state.sort).toBeNull();
    expect(state.page).toBe(0);
    expect(state.pageSize).toBe(20);
  });
});
