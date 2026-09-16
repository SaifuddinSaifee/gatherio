'use client';

import { useOptimistic, useTransition } from 'react';
import { SegmentedButtons } from '@/components/ui/segmented-buttons';
import type { DashboardView } from '@/lib/dashboard-prefs';
import { setDashboardViewAction } from './actions';

const OPTIONS: { value: DashboardView; label: string }[] = [
  { value: 'table', label: 'Table' },
  { value: 'list', label: 'List' },
];

export function ViewSwitcher({ view }: { view: DashboardView }) {
  const [, startTransition] = useTransition();
  const [optimisticView, setOptimisticView] = useOptimistic(view);

  return (
    <SegmentedButtons
      aria-label="Dashboard view"
      options={OPTIONS}
      value={optimisticView}
      size="sm"
      onChange={(next) => {
        if (next === optimisticView) return;
        startTransition(async () => {
          setOptimisticView(next);
          await setDashboardViewAction(next);
        });
      }}
    />
  );
}
