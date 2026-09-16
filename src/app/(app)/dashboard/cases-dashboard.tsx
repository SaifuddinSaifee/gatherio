'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { MdAdd } from 'react-icons/md';
import { ButtonLink } from '@/components/ui/button';
import {
  DASHBOARD_VIEW_COOKIE,
  writeDashboardPrefCookie,
  type DashboardView,
} from '@/lib/dashboard-prefs';
import {
  caseTableStateToSearchParams,
  type CaseTableFilters,
  type CaseTableRow,
  type CaseTableState,
  type CaseTableView,
  type HideableColumnId,
} from '@/lib/domain/dashboard-table';
import { CasesList } from './cases-list';
import { CasesTable } from './cases-table';
import { ReturnQueryContext } from './return-query';
import { ViewSwitcher } from './view-switcher';

interface CasesDashboardProps {
  initialView: DashboardView;
  /** Search, filters, sort, and page parsed from the URL. */
  initialState: CaseTableState;
  /** Every case, in dashboard priority order. */
  rows: CaseTableRow[];
  /** The server-rendered list-view card for each case, by case id. */
  cards: Record<string, ReactNode>;
  now: Date;
  initialHiddenColumns: HideableColumnId[];
  /** Status/alert lines under the heading. */
  notices: ReactNode;
  /** Shown instead of either view when the workspace has no cases. */
  empty: ReactNode;
}

/**
 * Switching views is purely client-side: the heading and actions stay
 * mounted, and the state worth keeping across a switch — search and
 * filters (shared by both views), plus the table's sort, page, and
 * columns — lives here. It also keeps the URL in step with that state.
 */
export function CasesDashboard({
  initialView,
  initialState,
  rows,
  cards,
  now,
  initialHiddenColumns,
  notices,
  empty,
}: CasesDashboardProps) {
  const [view, setView] = useState(initialView);
  const [filters, setFilters] = useState<CaseTableFilters>({
    query: initialState.query,
    statuses: initialState.statuses,
    templates: initialState.templates,
    flags: initialState.flags,
  });
  const [tableView, setTableView] = useState<CaseTableView>({
    sort: initialState.sort,
    page: initialState.page,
    pageSize: initialState.pageSize,
  });
  const [hiddenColumns, setHiddenColumns] = useState(initialHiddenColumns);

  const returnQuery = caseTableStateToSearchParams({ ...filters, ...tableView }).toString();

  useEffect(() => {
    const url = returnQuery ? `/dashboard?${returnQuery}` : '/dashboard';
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState(null, '', url);
    }
  }, [returnQuery]);

  function changeView(next: DashboardView) {
    setView(next);
    writeDashboardPrefCookie(DASHBOARD_VIEW_COOKIE, next);
  }

  function updateFilters(patch: Partial<CaseTableFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setTableView((current) => (current.page === 0 ? current : { ...current, page: 0 }));
  }

  const hasCases = rows.length > 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-headline-small font-medium text-md-on-surface">Cases</h1>
        <div className="flex flex-wrap items-center gap-3">
          {hasCases && <ViewSwitcher view={view} onChange={changeView} />}
          <ButtonLink href="/cases/new" variant="filled" size="sm">
            <MdAdd aria-hidden="true" className="h-4 w-4" />
            New case
          </ButtonLink>
        </div>
      </div>

      {notices}

      <div className="mt-6">
        {!hasCases ? (
          empty
        ) : (
          <ReturnQueryContext.Provider value={returnQuery}>
            {view === 'table' ? (
              <CasesTable
                rows={rows}
                now={now}
                filters={filters}
                onFiltersChange={updateFilters}
                view={tableView}
                onViewChange={setTableView}
                hiddenColumns={hiddenColumns}
                onHiddenColumnsChange={setHiddenColumns}
              />
            ) : (
              <CasesList
                rows={rows}
                cards={cards}
                filters={filters}
                onFiltersChange={updateFilters}
              />
            )}
          </ReturnQueryContext.Provider>
        )}
      </div>
    </main>
  );
}
