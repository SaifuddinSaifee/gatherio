'use client';

import { MdArrowDownward, MdArrowUpward, MdUnfoldMore } from 'react-icons/md';
import { cn } from '@/lib/cn';
import type { RowData } from '@tanstack/react-table';
import type { DataTableColumn } from './use-data-table';

/**
 * A sortable column heading. The button's name is just the column label;
 * the current direction is announced by the `<th>`'s `aria-sort`. Clicking
 * cycles ascending → descending → unsorted (the caller's default order).
 */
export function DataTableColumnHeader<TData extends RowData>({ column }: { column: DataTableColumn<TData> }) {
  const label = column.columnDef.meta?.label ?? column.id;

  if (!column.getCanSort()) return <span>{label}</span>;

  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? MdArrowUpward : sorted === 'desc' ? MdArrowDownward : MdUnfoldMore;

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        'group -mx-2 inline-flex h-8 cursor-pointer items-center gap-1 rounded-sm px-2 outline-none transition-colors duration-(--duration-effects-fast) hover:bg-md-surface-container-high hover:text-md-on-surface focus-visible:ring-2 focus-visible:ring-md-primary',
        sorted && 'text-md-on-surface',
      )}
    >
      {label}
      <Icon
        aria-hidden="true"
        className={cn('h-4 w-4 shrink-0', !sorted && 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100')}
      />
    </button>
  );
}
