'use client';

import { MdViewColumn } from 'react-icons/md';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover } from '@/components/ui/popover';
import type { RowData } from '@tanstack/react-table';
import type { DataTableInstance } from './use-data-table';

/** The "Columns" control: one checkbox per hideable column, labelled by its `meta.label`. */
export function DataTableViewOptions<TData extends RowData>({ table }: { table: DataTableInstance<TData> }) {
  const columns = table.getAllLeafColumns().filter((column) => column.getCanHide());

  return (
    <Popover
      align="end"
      trigger={
        <>
          <MdViewColumn aria-hidden="true" className="h-4.5 w-4.5" />
          Columns
        </>
      }
      triggerClassName="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-md-outline px-3 text-label-large text-md-on-surface-variant outline-none transition-colors duration-(--duration-effects-fast) hover:bg-md-surface-container-high focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2"
    >
      <fieldset>
        <legend className="px-4 pb-1 text-label-medium font-medium text-md-on-surface-variant">Show columns</legend>
        {columns.map((column) => (
          <label
            key={column.id}
            className="flex cursor-pointer items-center gap-1 pr-4 pl-1 text-body-medium text-md-on-surface hover:bg-md-surface-container-high"
          >
            <Checkbox
              checked={column.getIsVisible()}
              onChange={(event) => column.toggleVisibility(event.target.checked)}
            />
            {column.columnDef.meta?.label ?? column.id}
          </label>
        ))}
      </fieldset>
    </Popover>
  );
}
