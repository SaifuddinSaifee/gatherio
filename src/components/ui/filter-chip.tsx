import { cn } from '@/lib/cn';

/**
 * Material filter chip styling (design-revised.md's component inventory
 * names Chip as "add when a real consumer needs it" — the dashboard's
 * faceted filters are that consumer). Callers pair the selected state with
 * a leading checkmark, so selection is never color-only (§72).
 */
export function filterChipClassName(selected: boolean, className?: string): string {
  return cn(
    'group relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border px-3 text-label-large outline-none transition-colors duration-(--duration-effects-fast) focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2',
    selected
      ? 'border-transparent bg-md-secondary-container text-md-on-secondary-container'
      : 'border-md-outline text-md-on-surface-variant hover:bg-md-surface-container-high',
    className,
  );
}
