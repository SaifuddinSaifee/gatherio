'use client';

import { useState, type ReactNode } from 'react';
import { MdAdd } from 'react-icons/md';
import { ButtonLink } from '@/components/ui/button';
import {
  DASHBOARD_VIEWS,
  DASHBOARD_VIEW_COOKIE,
  writeDashboardPrefCookie,
  type DashboardView,
} from '@/lib/dashboard-prefs';
import { ViewSwitcher } from './view-switcher';

interface CasesDashboardProps {
  initialView: DashboardView;
  /** Status/alert lines under the heading. */
  notices: ReactNode;
  /** One rendered view per mode, or null when there are no cases (nothing to switch). */
  views: Record<DashboardView, ReactNode> | null;
  empty: ReactNode;
}

/**
 * Switching views is purely client-side: the heading and actions stay
 * mounted, and a view stays mounted (hidden) once shown, so going back to
 * the table keeps its search, filters, sort, and selection.
 */
export function CasesDashboard({ initialView, notices, views, empty }: CasesDashboardProps) {
  const [view, setView] = useState(initialView);
  const [shown, setShown] = useState<ReadonlySet<DashboardView>>(() => new Set([initialView]));

  function changeView(next: DashboardView) {
    setView(next);
    setShown((current) => (current.has(next) ? current : new Set(current).add(next)));
    writeDashboardPrefCookie(DASHBOARD_VIEW_COOKIE, next);
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-headline-small font-medium text-md-on-surface">Cases</h1>
        <div className="flex flex-wrap items-center gap-3">
          {views && <ViewSwitcher view={view} onChange={changeView} />}
          <ButtonLink href="/cases/new" variant="filled" size="sm">
            <MdAdd aria-hidden="true" className="h-4 w-4" />
            New case
          </ButtonLink>
        </div>
      </div>

      {notices}

      <div className="mt-6">
        {views
          ? DASHBOARD_VIEWS.filter((v) => shown.has(v)).map((v) => (
              <div key={v} hidden={v !== view}>
                {views[v]}
              </div>
            ))
          : empty}
      </div>
    </main>
  );
}
