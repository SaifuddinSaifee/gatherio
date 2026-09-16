import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { MdCheck } from 'react-icons/md';
import { cn } from '@/lib/cn';

interface FilterChipProps {
  href: Route;
  selected: boolean;
  count: number;
  children: ReactNode;
}

/**
 * Material filter chip (design-revised.md's component inventory names
 * Chip as "add when a real consumer needs it" — the dashboard's status
 * filters, Stage 8.5, are that consumer). Rendered as a `Link` rather
 * than a button, since the filter is server-side (`?filter=`, design
 * decision 10) with no client JS. Selection is never color-only (§72): a
 * leading checkmark appears alongside the container-color change.
 */
/** Shared with chip-shaped buttons (the dashboard table's facet triggers), so both read as one chip family. */
export function filterChipClassName(selected: boolean, className?: string): string {
  return cn(
    'group relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border px-3 text-label-large outline-none transition-colors duration-(--duration-effects-fast) focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2',
    selected
      ? 'border-transparent bg-md-secondary-container text-md-on-secondary-container'
      : 'border-md-outline text-md-on-surface-variant hover:bg-md-surface-container-high',
    className,
  );
}

export function FilterChip({ href, selected, count, children }: FilterChipProps) {
  return (
    <Link
      href={href}
      aria-current={selected ? 'page' : undefined}
      className={filterChipClassName(selected)}
    >
      {selected && <MdCheck aria-hidden="true" className="h-4.5 w-4.5" />}
      {children}
      <span className={selected ? 'text-md-on-secondary-container' : 'text-md-on-surface-variant'}>
        ({count})
      </span>
    </Link>
  );
}
