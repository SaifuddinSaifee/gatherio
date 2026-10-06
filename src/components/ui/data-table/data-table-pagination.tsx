'use client';

import { useId } from 'react';
import { MdChevronLeft, MdChevronRight, MdFirstPage, MdLastPage } from 'react-icons/md';
import { IconButton } from '@/components/ui/icon-button';
import type { RowData } from '@tanstack/react-table';
import type { DataTableInstance } from './use-data-table';

interface DataTablePaginationProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  pageSizes: readonly number[];
  /** Plural noun for the range line, e.g. "cases" → "Showing 1–20 of 57 cases". */
  itemsLabel: string;
}

export function DataTablePagination<TData extends RowData>({ table, pageSizes, itemsLabel }: DataTablePaginationProps<TData>) {
  const sizeId = useId();
  const { pageIndex, pageSize } = table.state.pagination;
  const total = table.getRowCount();
  const pageCount = Math.max(1, table.getPageCount());
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-body-small text-md-on-surface-variant">
      <p aria-live="polite">
        {total === 0 ? `No ${itemsLabel}` : `Showing ${first}–${last} of ${total} ${itemsLabel}`}
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor={sizeId}>Rows per page</label>
          <select
            id={sizeId}
            value={pageSize}
            onChange={(event) => {
              table.setPageSize(Number(event.target.value));
              table.setPageIndex(0);
            }}
            className="h-8 cursor-pointer rounded-xs border border-md-outline bg-md-surface px-2 text-body-medium text-md-on-surface outline-none focus-visible:ring-2 focus-visible:ring-md-primary"
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <p>
          Page {Math.min(pageIndex + 1, pageCount)} of {pageCount}
        </p>

        <div className="flex items-center">
          <IconButton aria-label="First page" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <MdFirstPage aria-hidden="true" className="h-5 w-5" />
          </IconButton>
          <IconButton aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <MdChevronLeft aria-hidden="true" className="h-5 w-5" />
          </IconButton>
          <IconButton aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <MdChevronRight aria-hidden="true" className="h-5 w-5" />
          </IconButton>
          <IconButton
            aria-label="Last page"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <MdLastPage aria-hidden="true" className="h-5 w-5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
