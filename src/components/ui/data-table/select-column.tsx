'use client';

import { Checkbox } from '@/components/ui/checkbox';
import type { RowData } from '@tanstack/react-table';
import type { DataTableColumnDef } from './use-data-table';

/** The leading checkbox column: select-all for the current page in the header, one box per row. */
export function createSelectColumn<TData extends RowData>(rowLabel: (row: TData) => string): DataTableColumnDef<TData> {
  return {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    meta: { label: 'Select', headerClassName: 'w-12 px-1', cellClassName: 'w-12 px-1 py-1' },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${rowLabel(row.original)}`}
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  };
}
