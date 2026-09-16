'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { RowData } from '@tanstack/react-table';
import type { DataTableInstance } from './use-data-table';

interface DataTableSelectionBarProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  /** Singular and plural noun, e.g. ["case", "cases"]. */
  noun: readonly [string, string];
  /** Bulk actions for the selected rows. */
  children: ReactNode;
}

/** Appears only while rows are selected: the count, the caller's bulk actions, and a way out. */
export function DataTableSelectionBar<TData extends RowData>({ table, noun, children }: DataTableSelectionBarProps<TData>) {
  const count = table.getSelectedRowModel().rows.length;
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-md-secondary-container px-4 py-2 text-md-on-secondary-container">
      <p role="status" className="text-label-large font-medium">
        {count} {count === 1 ? noun[0] : noun[1]} selected
      </p>
      {children}
      <Button variant="text" className="ml-auto" onClick={() => table.resetRowSelection()}>
        Clear selection
      </Button>
    </div>
  );
}
