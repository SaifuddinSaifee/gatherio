/**
 * Pure shaping for the dashboard's data table view (Stage 8.6). Filtering
 * lives here, before the table, rather than inside TanStack Table's
 * filtering feature: which cases a filter matches is a product rule and
 * gets unit-tested like dashboard.ts and case-status.ts. The table itself
 * only sorts, paginates, selects, and hides columns.
 */

import type { DashboardCase } from './case';
import type { CaseStatusResult, ReminderEligibility } from './case-status';
import { daysOpen } from '@/lib/format-time';

export type CaseStatus = CaseStatusResult['status'];

export const CASE_STATUSES = ['needs_review', 'awaiting_recipient', 'complete'] as const satisfies readonly CaseStatus[];

export const CASE_FLAGS = ['overdue', 'due_soon', 'never_opened', 'email_failed', 'changes_requested'] as const;
export type CaseFlag = (typeof CASE_FLAGS)[number];

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

const ACTIVITY_LABEL: Record<string, string> = {
  'case.viewed': 'Viewed the link',
  'assignment.started': 'Started an item',
  'assignment.submitted': 'Submitted an item',
};

export interface CaseTableRow {
  id: string;
  name: string;
  templateName: string;
  recipient: { name: string; organization: string | null; email: string | null } | null;
  status: CaseStatus;
  counts: CaseStatusResult['counts'];
  blockingItems: { title: string; state: 'awaiting_recipient' | 'changes_requested'; reason: string | null }[];
  dueAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  daysOpen: number;
  lastActivity: { label: string; at: Date } | null;
  lastContact: { kind: 'invite' | 'reminder'; failed: boolean; at: Date } | null;
  reminder: ReminderEligibility;
  flags: CaseFlag[];
}

export function caseFlags(row: DashboardCase, now: Date): CaseFlag[] {
  const flags: CaseFlag[] = [];
  const open = row.status !== 'complete';
  const due = row.case.dueAt?.getTime();

  if (open && due !== undefined) {
    if (due < now.getTime()) flags.push('overdue');
    else if (due - now.getTime() <= DUE_SOON_MS) flags.push('due_soon');
  }
  if (open && !row.lastRecipientActivity) flags.push('never_opened');
  if (row.lastContact?.status === 'failed') flags.push('email_failed');
  if (row.counts.changesRequested > 0) flags.push('changes_requested');
  return flags;
}

export function toCaseTableRow(row: DashboardCase, now: Date): CaseTableRow {
  return {
    id: row.case.id,
    name: row.case.name,
    templateName: row.templateName,
    recipient: row.party
      ? { name: row.party.displayName, organization: row.party.organizationName, email: row.party.email }
      : null,
    status: row.status,
    counts: row.counts,
    blockingItems: row.blockingItems.map(({ title, state, reason }) => ({ title, state, reason })),
    dueAt: row.case.dueAt,
    createdAt: row.case.createdAt,
    completedAt: row.case.completedAt,
    daysOpen: daysOpen(row.case.createdAt, now),
    lastActivity: row.lastRecipientActivity
      ? {
          label: ACTIVITY_LABEL[row.lastRecipientActivity.eventType] ?? 'Was active',
          at: row.lastRecipientActivity.occurredAt,
        }
      : null,
    lastContact: row.lastContact
      ? {
          kind: row.lastContact.templateRef === 'case_invite' ? 'invite' : 'reminder',
          failed: row.lastContact.status === 'failed',
          at: row.lastContact.createdAt,
        }
      : null,
    reminder: row.reminder,
    flags: caseFlags(row, now),
  };
}

// ---------------------------------------------------------------------------
// Filtering and facets
// ---------------------------------------------------------------------------

export interface CaseTableFilters {
  query: string;
  statuses: CaseStatus[];
  templates: string[];
  flags: CaseFlag[];
}

export const EMPTY_FILTERS: CaseTableFilters = { query: '', statuses: [], templates: [], flags: [] };

type Facet = 'statuses' | 'templates' | 'flags';

export function hasActiveFilters(filters: CaseTableFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.statuses.length > 0 ||
    filters.templates.length > 0 ||
    filters.flags.length > 0
  );
}

function matchesQuery(row: CaseTableRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.name, row.templateName, row.recipient?.name, row.recipient?.organization, row.recipient?.email]
    .some((field) => field?.toLowerCase().includes(needle));
}

/** Options within one facet are OR'd; different facets (and the search) are AND'd. `skip` leaves one facet out, for its own counts. */
function matches(row: CaseTableRow, filters: CaseTableFilters, skip?: Facet): boolean {
  if (!matchesQuery(row, filters.query)) return false;
  if (skip !== 'statuses' && filters.statuses.length > 0 && !filters.statuses.includes(row.status)) return false;
  if (skip !== 'templates' && filters.templates.length > 0 && !filters.templates.includes(row.templateName)) return false;
  if (skip !== 'flags' && filters.flags.length > 0 && !filters.flags.some((f) => row.flags.includes(f))) return false;
  return true;
}

export function filterCaseRows(rows: readonly CaseTableRow[], filters: CaseTableFilters): CaseTableRow[] {
  return rows.filter((row) => matches(row, filters));
}

export interface CaseTableFacets {
  statuses: Record<CaseStatus, number>;
  /** Every template present in the unfiltered rows, alphabetical, so an option never disappears while it's selected. */
  templates: { name: string; count: number }[];
  flags: Record<CaseFlag, number>;
}

/** Each facet's counts respect every *other* active filter — "if I also ticked this, how many would I see". */
export function facetCounts(rows: readonly CaseTableRow[], filters: CaseTableFilters): CaseTableFacets {
  const statuses = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<CaseStatus, number>;
  const flags = Object.fromEntries(CASE_FLAGS.map((f) => [f, 0])) as Record<CaseFlag, number>;
  const templateCounts = new Map<string, number>();

  for (const row of rows) {
    if (!templateCounts.has(row.templateName)) templateCounts.set(row.templateName, 0);
    if (matches(row, filters, 'statuses')) statuses[row.status] += 1;
    if (matches(row, filters, 'templates')) {
      templateCounts.set(row.templateName, (templateCounts.get(row.templateName) ?? 0) + 1);
    }
    if (matches(row, filters, 'flags')) for (const flag of row.flags) flags[flag] += 1;
  }

  const templates = [...templateCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { statuses, templates, flags };
}

// ---------------------------------------------------------------------------
// Columns and URL state
// ---------------------------------------------------------------------------

export const TABLE_COLUMN_IDS = [
  'select',
  'name',
  'recipient',
  'status',
  'outstanding',
  'dueAt',
  'activity',
  'daysOpen',
  'createdAt',
  'actions',
] as const;
export type TableColumnId = (typeof TABLE_COLUMN_IDS)[number];

export const HIDEABLE_COLUMN_IDS = [
  'recipient',
  'status',
  'outstanding',
  'dueAt',
  'activity',
  'daysOpen',
  'createdAt',
] as const satisfies readonly TableColumnId[];
export type HideableColumnId = (typeof HIDEABLE_COLUMN_IDS)[number];

export const SORTABLE_COLUMN_IDS = [
  'name',
  'recipient',
  'status',
  'outstanding',
  'dueAt',
  'activity',
  'daysOpen',
  'createdAt',
] as const satisfies readonly TableColumnId[];
export type SortableColumnId = (typeof SORTABLE_COLUMN_IDS)[number];

export const PAGE_SIZES = [10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: PageSize = 20;

export interface CaseTableState extends CaseTableFilters {
  sort: { id: SortableColumnId; desc: boolean } | null;
  /** Zero-based. */
  page: number;
  pageSize: PageSize;
}

/** The table-only part of the state: what the list view doesn't share. */
export type CaseTableView = Pick<CaseTableState, 'sort' | 'page' | 'pageSize'>;

export const DEFAULT_TABLE_STATE: CaseTableState = { ...EMPTY_FILTERS, sort: null, page: 0, pageSize: DEFAULT_PAGE_SIZE };

type SearchParamsInput = Record<string, string | string[] | undefined> | URLSearchParams;

function readAll(params: SearchParamsInput, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const value = params[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function readOne(params: SearchParamsInput, key: string): string | undefined {
  return readAll(params, key)[0];
}

function oneOf<T extends string>(allowed: readonly T[], values: string[]): T[] {
  return [...new Set(values.filter((v): v is T => (allowed as readonly string[]).includes(v)))];
}

export function parseCaseTableState(params: SearchParamsInput): CaseTableState {
  const [sortId, sortDir] = (readOne(params, 'sort') ?? '').split('.');
  const sort = (SORTABLE_COLUMN_IDS as readonly string[]).includes(sortId ?? '')
    ? { id: sortId as SortableColumnId, desc: sortDir === 'desc' }
    : null;

  const page = Number.parseInt(readOne(params, 'page') ?? '', 10);
  const size = Number.parseInt(readOne(params, 'size') ?? '', 10);

  return {
    query: (readOne(params, 'q') ?? '').slice(0, 200),
    statuses: oneOf(CASE_STATUSES, readAll(params, 'status')),
    templates: [...new Set(readAll(params, 'template').filter((t) => t.length > 0 && t.length <= 200))],
    flags: oneOf(CASE_FLAGS, readAll(params, 'flag')),
    sort,
    // URL pages are one-based for people reading the address bar.
    page: Number.isFinite(page) && page > 1 ? page - 1 : 0,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_PAGE_SIZE,
  };
}

/** Only non-default values are written, so an unfiltered table is plain `/dashboard`. */
export function caseTableStateToSearchParams(state: CaseTableState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set('q', state.query.trim());
  for (const s of state.statuses) params.append('status', s);
  for (const t of state.templates) params.append('template', t);
  for (const f of state.flags) params.append('flag', f);
  if (state.sort) params.set('sort', `${state.sort.id}.${state.sort.desc ? 'desc' : 'asc'}`);
  if (state.page > 0) params.set('page', String(state.page + 1));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set('size', String(state.pageSize));
  return params;
}
