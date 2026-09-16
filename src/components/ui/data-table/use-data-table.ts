'use client';

import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type Column,
  type ColumnDef,
  type ReactTable,
  type RowData,
  type TableState,
} from '@tanstack/react-table';

export interface DataTableColumnMeta {
  /** Human name used by the column header, the Columns menu, and screen readers. */
  label: string;
  align?: 'start' | 'end';
  headerClassName?: string;
  cellClassName?: string;
}

/**
 * The one feature set every Gather data table shares. Filtering is
 * deliberately absent: callers filter their rows before handing them to
 * the table, where the filter rules can be pure and unit-tested.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnVisibilityFeature,
  columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a column list mixes value types, exactly like TanStack's own ColumnHelper.columns
export type DataTableColumnDef<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;
export type DataTableColumn<TData extends RowData> = Column<DataTableFeatures, TData, unknown>;
export type DataTableInstance<TData extends RowData> = ReactTable<DataTableFeatures, TData>;
export type DataTableState = TableState<DataTableFeatures>;

export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export interface UseDataTableOptions<TData extends RowData> {
  /** Keep this reference stable (memoize it); a new array every render recomputes every row model. */
  data: TData[];
  columns: DataTableColumnDef<TData>[];
  getRowId: (row: TData) => string;
  initialState?: Partial<Pick<DataTableState, 'sorting' | 'pagination' | 'columnVisibility' | 'rowSelection'>>;
  enableRowSelection?: boolean | ((row: TData) => boolean);
}

export function useDataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  initialState,
  enableRowSelection = true,
}: UseDataTableOptions<TData>): DataTableInstance<TData> {
  return useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId: (row) => getRowId(row),
    initialState,
    enableRowSelection:
      typeof enableRowSelection === 'function' ? (row) => enableRowSelection(row.original) : enableRowSelection,
    // Callers own when the page resets (e.g. on a filter change) — an
    // automatic reset on every new data reference would also fire after a
    // server refresh and throw away the page the URL asked for.
    autoResetPageIndex: false,
  });
}
