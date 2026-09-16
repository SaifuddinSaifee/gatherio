'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  MdCheckCircle,
  MdError,
  MdMailOutline,
  MdEventBusy,
  MdMarkEmailUnread,
  MdRateReview,
  MdReplay,
  MdSchedule,
  MdSend,
  MdVisibility,
  MdVisibilityOff,
} from 'react-icons/md';
import { Button, ButtonLink } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { DataTable } from '@/components/ui/data-table/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import {
  DataTableFacetedFilter,
  type FacetOption,
} from '@/components/ui/data-table/data-table-faceted-filter';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableSearch } from '@/components/ui/data-table/data-table-search';
import { DataTableSelectionBar } from '@/components/ui/data-table/data-table-selection-bar';
import { DataTableViewOptions } from '@/components/ui/data-table/data-table-view-options';
import { createSelectColumn } from '@/components/ui/data-table/select-column';
import {
  createDataTableColumnHelper,
  useDataTable,
  type DataTableColumnDef,
} from '@/components/ui/data-table/use-data-table';
import { sendReminderAction, sendRemindersAction } from '@/app/(app)/cases/actions';
import {
  CASE_FLAGS,
  CASE_STATUSES,
  EMPTY_FILTERS,
  PAGE_SIZES,
  SORTABLE_COLUMN_IDS,
  caseTableStateToSearchParams,
  facetCounts,
  filterCaseRows,
  hasActiveFilters,
  type CaseFlag,
  type CaseStatus,
  type CaseTableFilters,
  type CaseTableRow,
  type CaseTableState,
  type HideableColumnId,
  type PageSize,
  type SortableColumnId,
} from '@/lib/domain/dashboard-table';
import {
  DASHBOARD_HIDDEN_COLUMNS_COOKIE,
  serializeHiddenColumns,
  writeDashboardPrefCookie,
} from '@/lib/dashboard-prefs';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format-time';
import { cn } from '@/lib/cn';

const STATUS_LABEL: Record<CaseStatus, string> = {
  needs_review: 'Needs review',
  awaiting_recipient: 'Waiting on recipient',
  complete: 'Complete',
};

const STATUS_ICON = {
  needs_review: MdRateReview,
  awaiting_recipient: MdSchedule,
  complete: MdCheckCircle,
};

const FLAG_LABEL: Record<CaseFlag, string> = {
  overdue: 'Overdue',
  due_soon: 'Due within 7 days',
  never_opened: 'Link never opened',
  email_failed: 'Last email failed',
  changes_requested: 'Changes requested',
};

const FLAG_ICON = {
  overdue: MdEventBusy,
  due_soon: MdSchedule,
  never_opened: MdVisibilityOff,
  email_failed: MdMarkEmailUnread,
  changes_requested: MdReplay,
};

const STATUS_RANK: Record<CaseStatus, number> = {
  needs_review: 0,
  awaiting_recipient: 1,
  complete: 2,
};

function acceptedRatio(row: CaseTableRow): number {
  return row.counts.required === 0 ? 1 : row.counts.accepted / row.counts.required;
}

/** Changes on every filter/sort/page move, which is why cells read it from context rather than from the (memoized) column definitions. */
const TableContext = createContext<{ now: Date; returnQuery: string }>({
  now: new Date(0),
  returnQuery: '',
});

/**
 * Box sizing for the status badge — height, padding, icon gap. Kept apart
 * from the per-status colors below. Its font size is the `--text-badge`
 * role in globals.css.
 */
const STATUS_BADGE_CLASS =
  'inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-badge leading-none font-medium whitespace-nowrap';
/** Icon inside the badge — keep roughly matched to STATUS_BADGE_CLASS's font size. */
const STATUS_BADGE_ICON_CLASS = 'h-2.75 w-2.75';

function StatusBadge({ status }: { status: CaseStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        STATUS_BADGE_CLASS,
        status === 'needs_review' && 'bg-md-tertiary-container text-md-on-tertiary-container',
        status === 'awaiting_recipient' &&
          'bg-md-surface-container-highest text-md-on-surface-variant',
        status === 'complete' && 'bg-md-primary-container text-md-on-primary-container',
      )}
    >
      <Icon aria-hidden="true" className={STATUS_BADGE_ICON_CLASS} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-md-on-surface-variant">{children}</span>;
}

function RelativeTime({ at }: { at: Date }) {
  const { now } = useContext(TableContext);
  return (
    <time
      dateTime={at.toISOString()}
      title={formatDateTime(at)}
      className="text-table-cell-meta text-md-on-surface-variant"
    >
      {formatRelative(at, now)}
    </time>
  );
}

function RowActions({ row }: { row: CaseTableRow }) {
  const { returnQuery } = useContext(TableContext);
  return (
    <div className="flex items-center justify-end gap-2">
      {row.status === 'needs_review' && (
        <ButtonLink
          href={`/cases/${row.id}`}
          variant="text"
          size="sm"
          className="px-3"
          aria-label={`Review ${row.name}`}
        >
          Review
        </ButtonLink>
      )}
      {row.reminder.ok && (
        <form action={sendReminderAction}>
          <input type="hidden" name="caseId" value={row.id} />
          <input type="hidden" name="returnTo" value="dashboard" />
          <input type="hidden" name="returnQuery" value={returnQuery} />
          <SubmitButton
            variant="tonal"
            size="sm"
            className="px-3"
            pendingLabel="Sending…"
            aria-label={`Send reminder for ${row.name}`}
          >
            Remind
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

const helper = createDataTableColumnHelper<CaseTableRow>();

const COLUMNS: DataTableColumnDef<CaseTableRow>[] = [
  createSelectColumn<CaseTableRow>((row) => row.name),
  helper.accessor('name', {
    id: 'name',
    sortFn: 'text',
    enableHiding: false,
    meta: { label: 'Case', cellClassName: 'min-w-44' },
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => (
      <div>
        <Link
          href={`/cases/${row.original.id}`}
          className="font-medium text-md-on-surface underline-offset-2 outline-none hover:underline focus-visible:rounded-xs focus-visible:ring-2 focus-visible:ring-md-primary"
        >
          {row.original.name}
        </Link>
        <p className="text-table-cell-meta text-md-on-surface-variant">
          {row.original.templateName}
        </p>
      </div>
    ),
  }),
  helper.accessor((row) => row.recipient?.name, {
    id: 'recipient',
    sortFn: 'text',
    sortUndefined: 'last',
    meta: { label: 'Recipient', cellClassName: 'min-w-40' },
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => {
      const recipient = row.original.recipient;
      if (!recipient) return <Muted>No recipient</Muted>;
      return (
        <div>
          <p>{recipient.name}</p>
          <p className="text-table-cell-meta text-md-on-surface-variant">
            {recipient.organization ?? recipient.email}
          </p>
        </div>
      );
    },
  }),
  // Sorts by status group first, then least progress first within a group.
  helper.accessor((row) => STATUS_RANK[row.status] + (1 - acceptedRatio(row)) / 2, {
    id: 'status',
    sortFn: 'basic',
    meta: { label: 'Status', cellClassName: 'w-48' },
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => {
      const { status, counts } = row.original;
      return (
        <div className="flex flex-col items-start gap-1.5">
          <StatusBadge status={status} />
          <div className="flex w-full items-center gap-2">
            <div
              aria-hidden="true"
              className="h-1 flex-1 rounded-full bg-md-surface-container-highest"
            >
              <div
                className="h-1 rounded-full bg-md-primary"
                style={{ width: `${Math.round(acceptedRatio(row.original) * 100)}%` }}
              />
            </div>
            <span className="text-table-cell-meta whitespace-nowrap text-md-on-surface-variant">
              {counts.accepted} of {counts.required} accepted
            </span>
          </div>
        </div>
      );
    },
  }),
  helper.accessor(
    (row) => (row.status === 'needs_review' ? row.counts.needsReview : row.blockingItems.length),
    {
      id: 'outstanding',
      sortFn: 'basic',
      meta: { label: 'Outstanding', cellClassName: 'min-w-44 max-w-64' },
      header: ({ column }) => <DataTableColumnHeader column={column} />,
      cell: ({ row }) => {
        const { status, counts, blockingItems } = row.original;
        if (status === 'complete') return <Muted>Nothing outstanding</Muted>;
        if (status === 'needs_review') {
          return (
            <p className="flex items-center gap-1.5">
              <MdRateReview aria-hidden="true" className="h-4 w-4 shrink-0 text-md-tertiary" />
              {counts.needsReview} to review
            </p>
          );
        }
        const [first, ...rest] = blockingItems;
        if (!first) return <Muted>Waiting on recipient</Muted>;
        return (
          <p title={blockingItems.map((item) => item.title).join('\n')}>
            <span className="line-clamp-1">
              {first.title}
              {first.state === 'changes_requested' && (
                <span className="text-md-error"> (changes requested)</span>
              )}
            </span>
            {rest.length > 0 && (
              <span className="text-table-cell-meta text-md-on-surface-variant">
                +{rest.length} more
              </span>
            )}
          </p>
        );
      },
    },
  ),
  helper.accessor((row) => row.dueAt ?? undefined, {
    id: 'dueAt',
    sortFn: 'datetime',
    sortUndefined: 'last',
    meta: { label: 'Due', cellClassName: 'whitespace-nowrap' },
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => {
      const { dueAt, flags } = row.original;
      if (!dueAt) return <Muted>—</Muted>;
      if (flags.includes('overdue')) {
        return (
          <span className="flex items-center gap-1 font-medium text-md-error">
            <MdError aria-hidden="true" className="h-4 w-4" />
            Overdue · {formatDate(dueAt)}
          </span>
        );
      }
      return <span>{formatDate(dueAt)}</span>;
    },
  }),
  helper.accessor('daysOpen', {
    id: 'daysOpen',
    sortFn: 'basic',
    meta: { label: 'Open for', align: 'end', cellClassName: 'whitespace-nowrap tabular-nums' },
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => `${row.original.daysOpen} ${row.original.daysOpen === 1 ? 'day' : 'days'}`,
  }),
  // One column for both sides of the conversation: what the recipient last did, and the last email we sent them.
  helper.accessor((row) => row.lastActivity?.at, {
    id: 'activity',
    sortFn: 'datetime',
    sortUndefined: 'last',
    meta: { label: 'Activity', cellClassName: 'whitespace-nowrap' },
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => {
      const { lastActivity, lastContact } = row.original;
      return (
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-1.5">
            <MdVisibility
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-md-on-surface-variant"
            />
            {lastActivity ? (
              <>
                {lastActivity.label} <RelativeTime at={lastActivity.at} />
              </>
            ) : (
              <Muted>Hasn&apos;t opened the link</Muted>
            )}
          </p>
          <p className="flex items-center gap-1.5">
            <MdMailOutline
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-md-on-surface-variant"
            />
            {!lastContact ? (
              <Muted>Not contacted</Muted>
            ) : lastContact.failed ? (
              <span className="font-medium text-md-error">
                Email failed <RelativeTime at={lastContact.at} />
              </span>
            ) : (
              <>
                {lastContact.kind === 'invite' ? 'Invite sent' : 'Reminded'}{' '}
                <RelativeTime at={lastContact.at} />
              </>
            )}
          </p>
        </div>
      );
    },
  }),
  helper.accessor('createdAt', {
    id: 'createdAt',
    sortFn: 'datetime',
    meta: { label: 'Created', cellClassName: 'whitespace-nowrap' },
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => formatDate(row.original.createdAt),
  }),
  helper.display({
    id: 'actions',
    enableHiding: false,
    meta: { label: 'Actions', align: 'end', headerClassName: 'w-px' },
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <RowActions row={row.original} />,
  }),
];

function isSortableId(id: string): id is SortableColumnId {
  return (SORTABLE_COLUMN_IDS as readonly string[]).includes(id);
}

interface CasesTableProps {
  /** Already in the dashboard's priority order — the table's order when no column is sorted. */
  rows: CaseTableRow[];
  now: Date;
  initialState: CaseTableState;
  hiddenColumns: HideableColumnId[];
}

export function CasesTable({ rows, now, initialState, hiddenColumns }: CasesTableProps) {
  const [filters, setFilters] = useState<CaseTableFilters>({
    query: initialState.query,
    statuses: initialState.statuses,
    templates: initialState.templates,
    flags: initialState.flags,
  });

  const filteredRows = useMemo(() => filterCaseRows(rows, filters), [rows, filters]);
  const facets = useMemo(() => facetCounts(rows, filters), [rows, filters]);

  const table = useDataTable({
    data: filteredRows,
    columns: COLUMNS,
    getRowId: (row) => row.id,
    initialState: {
      sorting: initialState.sort ? [initialState.sort] : [],
      pagination: { pageIndex: initialState.page, pageSize: initialState.pageSize },
      columnVisibility: Object.fromEntries(hiddenColumns.map((id) => [id, false])),
    },
  });

  const { sorting, pagination, columnVisibility } = table.state;
  const sortEntry = sorting[0];
  const tableState: CaseTableState = {
    ...filters,
    sort:
      sortEntry && isSortableId(sortEntry.id) ? { id: sortEntry.id, desc: sortEntry.desc } : null,
    page: pagination.pageIndex,
    pageSize: pagination.pageSize as PageSize,
  };
  const returnQuery = caseTableStateToSearchParams(tableState).toString();

  useEffect(() => {
    const url = returnQuery ? `/dashboard?${returnQuery}` : '/dashboard';
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState(null, '', url);
    }
  }, [returnQuery]);

  const hiddenCookieValue = serializeHiddenColumns(
    Object.entries(columnVisibility)
      .filter(([, visible]) => !visible)
      .map(([id]) => id),
  );
  const initialHiddenCookieValue = useRef(serializeHiddenColumns(hiddenColumns));
  useEffect(() => {
    if (hiddenCookieValue === initialHiddenCookieValue.current) return;
    initialHiddenCookieValue.current = hiddenCookieValue;
    writeDashboardPrefCookie(DASHBOARD_HIDDEN_COLUMNS_COOKIE, hiddenCookieValue);
  }, [hiddenCookieValue]);

  // A server refresh (e.g. after sending reminders) hands over new rows; selections from before it no longer mean anything.
  const lastRows = useRef(rows);
  useEffect(() => {
    if (rows === lastRows.current) return;
    lastRows.current = rows;
    table.resetRowSelection();
  }, [rows, table]);

  const pageCount = table.getPageCount();
  useEffect(() => {
    if (pageCount > 0 && pagination.pageIndex >= pageCount) table.setPageIndex(pageCount - 1);
  }, [pageCount, pagination.pageIndex, table]);

  function updateFilters(patch: Partial<CaseTableFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    table.setPageIndex(0);
  }

  const statusOptions: FacetOption<CaseStatus>[] = CASE_STATUSES.map((status) => ({
    value: status,
    label: STATUS_LABEL[status],
    count: facets.statuses[status],
    icon: STATUS_ICON[status],
  }));
  const templateOptions: FacetOption<string>[] = facets.templates.map(({ name, count }) => ({
    value: name,
    label: name,
    count,
  }));
  const flagOptions: FacetOption<CaseFlag>[] = CASE_FLAGS.map((flag) => ({
    value: flag,
    label: FLAG_LABEL[flag],
    count: facets.flags[flag],
    icon: FLAG_ICON[flag],
  }));

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const remindable = selectedRows.filter((row) => row.reminder.ok);
  const filtersActive = hasActiveFilters(filters);

  return (
    <TableContext.Provider value={{ now, returnQuery }}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <DataTableSearch
            label="Search cases, recipients, or templates"
            value={filters.query}
            onChange={(query) => updateFilters({ query })}
            className="w-full sm:w-80"
          />
          <DataTableFacetedFilter
            title="Status"
            options={statusOptions}
            selected={filters.statuses}
            onChange={(statuses) => updateFilters({ statuses })}
          />
          {templateOptions.length > 1 && (
            <DataTableFacetedFilter
              title="Template"
              options={templateOptions}
              selected={filters.templates}
              onChange={(templates) => updateFilters({ templates })}
            />
          )}
          <DataTableFacetedFilter
            title="Needs attention"
            options={flagOptions}
            selected={filters.flags}
            onChange={(flags) => updateFilters({ flags })}
          />
          {filtersActive && (
            <Button
              variant="text"
              size="sm"
              className="px-3"
              onClick={() => updateFilters(EMPTY_FILTERS)}
            >
              Clear filters
            </Button>
          )}
          <div className="ml-auto">
            <DataTableViewOptions table={table} />
          </div>
        </div>

        <DataTableSelectionBar table={table} noun={['case', 'cases']}>
          <form action={sendRemindersAction}>
            {remindable.map((row) => (
              <input key={row.id} type="hidden" name="caseId" value={row.id} />
            ))}
            <input type="hidden" name="returnQuery" value={returnQuery} />
            <SubmitButton
              variant="filled"
              className="h-9"
              disabled={remindable.length === 0}
              pendingLabel="Sending…"
            >
              <MdSend aria-hidden="true" className="h-4.5 w-4.5" />
              {remindable.length === 0 ? 'Send reminders' : `Send reminder to ${remindable.length}`}
            </SubmitButton>
          </form>
          {remindable.length < selectedRows.length && (
            <p className="text-body-small">
              {selectedRows.length - remindable.length} can&apos;t be reminded right now — complete,
              waiting on your review, no email, or reminded recently.
            </p>
          )}
        </DataTableSelectionBar>

        <DataTable
          table={table}
          caption="Cases"
          emptyState={
            <div className="flex flex-col items-center gap-2">
              <p className="text-body-medium text-md-on-surface-variant">
                No cases match these filters.
              </p>
              <Button variant="text" onClick={() => updateFilters(EMPTY_FILTERS)}>
                Clear filters
              </Button>
            </div>
          }
        />

        <DataTablePagination table={table} pageSizes={PAGE_SIZES} itemsLabel="cases" />
      </div>
    </TableContext.Provider>
  );
}
