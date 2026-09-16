'use client';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { MdError, MdMailOutline, MdRateReview, MdSend, MdVisibility } from 'react-icons/md';
import { ButtonLink } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { DataTable } from '@/components/ui/data-table/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
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
  EMPTY_FILTERS,
  PAGE_SIZES,
  SORTABLE_COLUMN_IDS,
  filterCaseRows,
  type CaseStatus,
  type CaseTableFilters,
  type CaseTableRow,
  type CaseTableView,
  type HideableColumnId,
  type PageSize,
  type SortableColumnId,
} from '@/lib/domain/dashboard-table';
import {
  DASHBOARD_HIDDEN_COLUMNS_COOKIE,
  parseHiddenColumns,
  serializeHiddenColumns,
  writeDashboardPrefCookie,
} from '@/lib/dashboard-prefs';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format-time';
import { cn } from '@/lib/cn';
import { CaseFilterToolbar, NoFilterMatches, STATUS_ICON, STATUS_LABEL } from './case-filters';
import { ReturnQueryInput } from './return-query';

const STATUS_RANK: Record<CaseStatus, number> = {
  needs_review: 0,
  awaiting_recipient: 1,
  complete: 2,
};

function acceptedRatio(row: CaseTableRow): number {
  return row.counts.required === 0 ? 1 : row.counts.accepted / row.counts.required;
}

/** Cells read `now` from context because the column definitions are module-level and never re-created. */
const TableContext = createContext<{ now: Date }>({ now: new Date(0) });

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
          <ReturnQueryInput />
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
  filters: CaseTableFilters;
  onFiltersChange: (patch: Partial<CaseTableFilters>) => void;
  /** Sort and pagination to start from; reported back as they change so they survive a view switch. */
  view: CaseTableView;
  onViewChange: (view: CaseTableView) => void;
  hiddenColumns: HideableColumnId[];
  onHiddenColumnsChange: (ids: HideableColumnId[]) => void;
}

export function CasesTable({
  rows,
  now,
  filters,
  onFiltersChange,
  view,
  onViewChange,
  hiddenColumns,
  onHiddenColumnsChange,
}: CasesTableProps) {
  const filteredRows = useMemo(() => filterCaseRows(rows, filters), [rows, filters]);

  const table = useDataTable({
    data: filteredRows,
    columns: COLUMNS,
    getRowId: (row) => row.id,
    initialState: {
      sorting: view.sort ? [view.sort] : [],
      pagination: { pageIndex: view.page, pageSize: view.pageSize },
      columnVisibility: Object.fromEntries(hiddenColumns.map((id) => [id, false])),
    },
  });

  const { sorting, pagination, columnVisibility } = table.state;
  const sortId = sorting[0]?.id;
  const sortDesc = sorting[0]?.desc ?? false;
  useEffect(() => {
    onViewChange({
      sort: sortId && isSortableId(sortId) ? { id: sortId, desc: sortDesc } : null,
      page: pagination.pageIndex,
      pageSize: pagination.pageSize as PageSize,
    });
  }, [sortId, sortDesc, pagination.pageIndex, pagination.pageSize, onViewChange]);

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
    onHiddenColumnsChange(parseHiddenColumns(hiddenCookieValue));
  }, [hiddenCookieValue, onHiddenColumnsChange]);

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
    onFiltersChange(patch);
    table.setPageIndex(0);
  }

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const remindable = selectedRows.filter((row) => row.reminder.ok);

  return (
    <TableContext.Provider value={{ now }}>
      <div className="flex flex-col gap-4">
        <CaseFilterToolbar
          rows={rows}
          filters={filters}
          onChange={updateFilters}
          trailing={<DataTableViewOptions table={table} />}
        />

        <DataTableSelectionBar table={table} noun={['case', 'cases']}>
          <form action={sendRemindersAction}>
            {remindable.map((row) => (
              <input key={row.id} type="hidden" name="caseId" value={row.id} />
            ))}
            <ReturnQueryInput />
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
          emptyState={<NoFilterMatches onClear={() => updateFilters(EMPTY_FILTERS)} />}
        />

        <DataTablePagination table={table} pageSizes={PAGE_SIZES} itemsLabel="cases" />
      </div>
    </TableContext.Provider>
  );
}
