'use client';

import type { IconType } from 'react-icons';
import { MdCheck } from 'react-icons/md';
import { cn } from '@/lib/cn';

interface SegmentedButtonOption<T extends string> {
  value: T;
  label: string;
  /** Leading icon. The selected segment shows the checkmark in its place. */
  icon?: IconType;
}

type SegmentedButtonsSize = 'sm' | 'md';

interface SegmentedButtonsProps<T extends string> {
  options: SegmentedButtonOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  /** 'md' (default) is the standard size. 'sm' is for dense contexts — a table toolbar. */
  size?: SegmentedButtonsSize;
  className?: string;
}

const SIZE_STYLES: Record<SegmentedButtonsSize, { root: string; segment: string; icon: string }> = {
  md: { root: 'h-10', segment: 'px-4 text-button', icon: 'h-4.5 w-4.5' },
  sm: { root: 'h-8', segment: 'px-3 text-button-sm', icon: 'h-3.5 w-3.5' },
};

/**
 * Material 3 segmented button (single-select) — m3.material.io/components/
 * segmented-buttons. Not in design-revised.md's component set, so built
 * directly against the canonical M3 spec per the doc's own source-of-truth
 * order (§ "Source-of-Truth Order": this design system, then current M3
 * guidance). Outer pill shape with square-cornered inner joins (achieved
 * via `first:rounded-l-full last:rounded-r-full` rather than a clipping
 * `overflow-hidden` container, which would also clip the focus ring), a
 * 1px divider between segments, and a real state-layer overlay per §9 —
 * never a background-alpha blend.
 *
 * Selected segment shows a leading checkmark, not color alone (§72) —
 * container/label swap to secondary-container / on-secondary-container.
 * A segment with its own icon shows that icon until selected, when the
 * checkmark replaces it (M3's icon + label segment behavior).
 *
 * Implemented as `role="radio"` buttons in a `role="radiogroup"` (single-
 * select semantics per ARIA authoring practices). Each button keeps its
 * own tab stop rather than a fully roving-tabindex radiogroup — a
 * deliberate, documented scope cut for a Phase 1a internal tool: still
 * fully operable by keyboard (Tab + Enter/Space), just not idiomatic
 * left/right arrow-key roving focus.
 */
export function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ...props
}: SegmentedButtonsProps<T>) {
  const sizeStyles = SIZE_STYLES[size];
  return (
    <div
      role="radiogroup"
      aria-label={props['aria-label']}
      className={cn('inline-flex', sizeStyles.root, className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = selected ? MdCheck : option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'group relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-y border-l border-md-outline outline-none first:rounded-l-full last:rounded-r-full last:border-r focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2',
              sizeStyles.segment,
              selected
                ? 'bg-md-secondary-container text-md-on-secondary-container'
                : 'bg-transparent text-md-on-surface',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-(--duration-effects-fast) group-hover:opacity-(--opacity-state-hover) group-active:opacity-(--opacity-state-pressed)',
                selected ? 'bg-md-on-secondary-container' : 'bg-md-on-surface',
              )}
            />
            <span className="relative z-10 flex items-center gap-1.5">
              {Icon && <Icon aria-hidden="true" className={sizeStyles.icon} />}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
