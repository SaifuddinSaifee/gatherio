'use client';

import type { IconType } from 'react-icons';
import { MdTableChart, MdViewAgenda } from 'react-icons/md';
import { SegmentedButtons } from '@/components/ui/segmented-buttons';
import type { DashboardView } from '@/lib/dashboard-prefs';

const OPTIONS: { value: DashboardView; label: string; icon: IconType }[] = [
  { value: 'table', label: 'Table', icon: MdTableChart },
  { value: 'list', label: 'List', icon: MdViewAgenda },
];

export function ViewSwitcher({
  view,
  onChange,
}: {
  view: DashboardView;
  onChange: (view: DashboardView) => void;
}) {
  return (
    <SegmentedButtons
      aria-label="Dashboard view"
      options={OPTIONS}
      value={view}
      size="sm"
      onChange={onChange}
    />
  );
}
