'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { RowData } from '@tanstack/react-table';
import type { DataTableInstance } from './use-data-table';

interface DataTableProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  /** Visually hidden table caption — the table's accessible name. */
  caption: string;
  /** Shown in place of rows when the (already filtered) data is empty. */
  emptyState: ReactNode;
}

/**
 * Renders a `useDataTable` instance as a real `<table>` (design-revised.md
 * §55A). Headers carry `aria-sort`. A selected row gets a surface change,
 * but its checkbox is what announces selection — `aria-selected` is only
 * valid on rows of an ARIA grid, which a read-and-act table is not.
 * Scrolls horizontally inside its own container so the page body never
 * does.
 */
export function DataTable<TData extends RowData>({ table, caption, emptyState }: DataTableProps<TData>) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    // `relative` makes this the containing block for absolutely positioned descendants (e.g. an sr-only header label), so they scroll with the table instead of widening the page.
    <div className="relative overflow-x-auto rounded-md border border-md-outline-variant bg-md-surface">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-md-outline-variant bg-md-surface-container-low">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      header.column.getCanSort()
                        ? sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                    className={cn(
                      'h-12 whitespace-nowrap px-4 text-label-large font-medium text-md-on-surface-variant',
                      meta?.align === 'end' && 'text-right',
                      meta?.headerClassName,
                    )}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-4 py-12 text-center">
                {emptyState}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const selected = row.getIsSelected();
              return (
                <tr
                  key={row.id}
                  data-selected={selected || undefined}
                  className={cn(
                    'border-b border-md-outline-variant transition-colors duration-(--duration-effects-fast) last:border-b-0',
                    selected ? 'bg-md-surface-container-high' : 'hover:bg-md-surface-container-low',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-4 py-3 align-top text-body-medium text-md-on-surface',
                          meta?.align === 'end' && 'text-right',
                          meta?.cellClassName,
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
