'use client';

import { useMemo, type ReactNode } from 'react';
import {
  MdCheckCircle,
  MdEventBusy,
  MdMarkEmailUnread,
  MdRateReview,
  MdReplay,
  MdSchedule,
  MdVisibilityOff,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import { Button } from '@/components/ui/button';
import {
  DataTableFacetedFilter,
  type FacetOption,
} from '@/components/ui/data-table/data-table-faceted-filter';
import { DataTableSearch } from '@/components/ui/data-table/data-table-search';
import {
  CASE_FLAGS,
  CASE_STATUSES,
  EMPTY_FILTERS,
  facetCounts,
  hasActiveFilters,
  type CaseFlag,
  type CaseStatus,
  type CaseTableFilters,
  type CaseTableRow,
} from '@/lib/domain/dashboard-table';

export const STATUS_LABEL: Record<CaseStatus, string> = {
  needs_review: 'Needs review',
  awaiting_recipient: 'Waiting on recipient',
  complete: 'Complete',
};

export const STATUS_ICON: Record<CaseStatus, IconType> = {
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

const FLAG_ICON: Record<CaseFlag, IconType> = {
  overdue: MdEventBusy,
  due_soon: MdSchedule,
  never_opened: MdVisibilityOff,
  email_failed: MdMarkEmailUnread,
  changes_requested: MdReplay,
};

interface CaseFilterToolbarProps {
  /** Every case, unfiltered — facet counts are computed from these. */
  rows: readonly CaseTableRow[];
  filters: CaseTableFilters;
  onChange: (patch: Partial<CaseTableFilters>) => void;
  /** View-specific controls pinned to the right, e.g. the table's Columns menu. */
  trailing?: ReactNode;
}

/** Search and facet filters shared by the dashboard's table and list views. */
export function CaseFilterToolbar({ rows, filters, onChange, trailing }: CaseFilterToolbarProps) {
  const facets = useMemo(() => facetCounts(rows, filters), [rows, filters]);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DataTableSearch
        label="Search cases, recipients, or templates"
        value={filters.query}
        onChange={(query) => onChange({ query })}
        className="w-full sm:w-80"
      />
      <DataTableFacetedFilter
        title="Status"
        options={statusOptions}
        selected={filters.statuses}
        onChange={(statuses) => onChange({ statuses })}
      />
      {templateOptions.length > 1 && (
        <DataTableFacetedFilter
          title="Template"
          options={templateOptions}
          selected={filters.templates}
          onChange={(templates) => onChange({ templates })}
        />
      )}
      <DataTableFacetedFilter
        title="Needs attention"
        options={flagOptions}
        selected={filters.flags}
        onChange={(flags) => onChange({ flags })}
      />
      {hasActiveFilters(filters) && (
        <Button variant="text" size="sm" className="px-3" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear filters
        </Button>
      )}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}

/** Shown in place of results when the filters match nothing. */
export function NoFilterMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-body-medium text-md-on-surface-variant">No cases match these filters.</p>
      <Button variant="text" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
