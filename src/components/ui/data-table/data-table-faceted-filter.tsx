'use client';

import type { IconType } from 'react-icons';
import { MdArrowDropDown, MdCheck } from 'react-icons/md';
import { Checkbox } from '@/components/ui/checkbox';
import { filterChipClassName } from '@/components/ui/filter-chip';
import { Popover } from '@/components/ui/popover';

export interface FacetOption<T extends string> {
  value: T;
  label: string;
  count: number;
  icon?: IconType;
}

interface DataTableFacetedFilterProps<T extends string> {
  title: string;
  options: readonly FacetOption<T>[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
}

/**
 * A multi-select filter chip (shadcn's "faceted filter" pattern, drawn as
 * an M3 filter chip with a dropdown arrow). Options are OR'd; the counts
 * are whatever the caller computed — typically "matches if also ticked".
 * Independent of the table instance, since filtering happens before the
 * table (see use-data-table.ts).
 */
export function DataTableFacetedFilter<T extends string>({ title, options, selected, onChange }: DataTableFacetedFilterProps<T>) {
  const active = selected.length > 0;
  const summary =
    selected.length === 1 ? options.find((o) => o.value === selected[0])?.label : `${selected.length} selected`;

  function toggle(value: T, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  }

  // "Filter by …" keeps the chip distinct from a same-named column's sort button for screen readers, while still containing the visible text.
  const name = `Filter by ${title.toLowerCase()}`;

  return (
    <Popover
      triggerLabel={active ? `${name}: ${summary}` : name}
      triggerClassName={filterChipClassName(active)}
      trigger={
        <>
          {active && <MdCheck aria-hidden="true" className="h-4.5 w-4.5" />}
          <span>{title}</span>
          {active && <span className="max-w-40 truncate text-md-on-secondary-container">· {summary}</span>}
          <MdArrowDropDown aria-hidden="true" className="-mr-1 h-4.5 w-4.5" />
        </>
      }
    >
      <fieldset>
        <legend className="sr-only">{title}</legend>
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-1 pr-4 pl-1 text-body-medium text-md-on-surface hover:bg-md-surface-container-high"
            >
              <Checkbox
                checked={selected.includes(option.value)}
                onChange={(event) => toggle(option.value, event.target.checked)}
              />
              {Icon && <Icon aria-hidden="true" className="mr-1 h-4.5 w-4.5 text-md-on-surface-variant" />}
              <span className="flex-1 whitespace-nowrap">{option.label}</span>
              <span className="pl-4 text-label-medium text-md-on-surface-variant tabular-nums">{option.count}</span>
            </label>
          );
        })}
      </fieldset>
      {active && (
        <div className="mt-1 border-t border-md-outline-variant px-2 pt-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="h-9 w-full cursor-pointer rounded-sm px-2 text-left text-label-large text-md-primary outline-none hover:bg-md-surface-container-high focus-visible:ring-2 focus-visible:ring-md-primary"
          >
            Clear {title.toLowerCase()} filter
          </button>
        </div>
      )}
    </Popover>
  );
}
