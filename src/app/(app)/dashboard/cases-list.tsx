'use client';

import { useMemo, type ReactNode } from 'react';
import { MdExpandMore } from 'react-icons/md';
import {
  EMPTY_FILTERS,
  filterCaseRows,
  hasActiveFilters,
  type CaseStatus,
  type CaseTableFilters,
  type CaseTableRow,
} from '@/lib/domain/dashboard-table';
import { CaseFilterToolbar, NoFilterMatches } from './case-filters';

const GROUPS: { status: CaseStatus; title: string; description: string }[] = [
  {
    status: 'needs_review',
    title: 'Needs your review',
    description: 'Submissions waiting for your decision.',
  },
  {
    status: 'awaiting_recipient',
    title: 'Waiting on recipient',
    description: 'Items the recipient still owes.',
  },
  { status: 'complete', title: 'Complete', description: 'Every required item accepted.' },
];

function GroupHeading({
  id,
  title,
  count,
  description,
}: {
  id: string;
  title: string;
  count: number;
  description: string;
}) {
  return (
    <div>
      <h2 id={id} className="text-title-medium font-medium text-md-on-surface">
        {title} <span className="text-md-on-surface-variant">({count})</span>
      </h2>
      <p className="text-body-small text-md-on-surface-variant">{description}</p>
    </div>
  );
}

interface CasesListProps {
  /** Every case, in dashboard priority order. */
  rows: CaseTableRow[];
  /** The server-rendered card for each case, by case id. */
  cards: Record<string, ReactNode>;
  filters: CaseTableFilters;
  onFiltersChange: (patch: Partial<CaseTableFilters>) => void;
}

/**
 * The dashboard's list view (Stage 8.6 decision 9): case cards grouped by
 * whose move it is, so each case reads as an action item. Shares the
 * table's search and filters.
 */
export function CasesList({ rows, cards, filters, onFiltersChange }: CasesListProps) {
  const visible = useMemo(() => filterCaseRows(rows, filters), [rows, filters]);
  const filtering = hasActiveFilters(filters);
  const groups = GROUPS.map((group) => ({
    ...group,
    rows: visible.filter((row) => row.status === group.status),
  })).filter((group) => group.rows.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <CaseFilterToolbar rows={rows} filters={filters} onChange={onFiltersChange} />

      {groups.length === 0 ? (
        <div className="py-12">
          <NoFilterMatches onClear={() => onFiltersChange(EMPTY_FILTERS)} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-10">
          {groups.map((group) => {
            const headingId = `group-${group.status}`;
            const list = (
              <ul className="mt-4 flex flex-col gap-3">
                {group.rows.map((row) => (
                  <li key={row.id}>{cards[row.id]}</li>
                ))}
              </ul>
            );

            // Complete cases need no action, so they stay folded away unless a filter or search is narrowing the list.
            if (group.status === 'complete' && !filtering) {
              return (
                <details key={group.status} className="group/complete">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-md-primary [&::-webkit-details-marker]:hidden">
                    <GroupHeading
                      id={headingId}
                      title={group.title}
                      count={group.rows.length}
                      description={group.description}
                    />
                    <MdExpandMore
                      aria-hidden="true"
                      className="h-6 w-6 shrink-0 text-md-on-surface-variant transition-transform duration-(--duration-effects-default) group-open/complete:rotate-180"
                    />
                  </summary>
                  {list}
                </details>
              );
            }

            return (
              <section key={group.status} aria-labelledby={headingId}>
                <GroupHeading
                  id={headingId}
                  title={group.title}
                  count={group.rows.length}
                  description={group.description}
                />
                {list}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
