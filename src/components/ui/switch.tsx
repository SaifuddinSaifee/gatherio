'use client';

import { MdCheck } from 'react-icons/md';
import { cn } from '@/lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
}

/**
 * Material 3 switch — m3.material.io/components/switch. Not in
 * design-revised.md's component set (only listed by name in §40's form-
 * control inventory, no spec detail), so built directly against the
 * canonical M3 spec per the doc's own Source-of-Truth Order (this design
 * system, then current M3 guidance) — same reasoning as SegmentedButtons.
 *
 * Track is 52x32dp (`w-13 h-8`, both exact canonical-scale matches, not
 * arbitrary values); the thumb grows from 16px unselected to 24px
 * selected (`h-4 w-4` -> `h-6 w-6`), which is the real M3 tell that a
 * switch is on versus a generic colored toggle. Selected also shows a
 * checkmark so state isn't color-only (§72).
 *
 * Disabled state uses separate reduced-opacity container/content colors
 * (`on-surface/12` track, `on-surface/38` thumb) rather than one blanket
 * `opacity-*` on the whole control — §10 names a blanket disabled opacity
 * as the specific anti-pattern to avoid.
 */
export function Switch({ checked, onChange, disabled, className, ...props }: SwitchProps) {
  const trackClass = disabled
    ? checked
      ? 'border-transparent bg-md-on-surface/12'
      : 'border-md-on-surface/12 bg-transparent'
    : checked
      ? 'border-md-primary bg-md-primary'
      : 'border-md-outline bg-md-surface-container-highest';

  const thumbClass = disabled ? 'bg-md-on-surface/38' : checked ? 'bg-md-on-primary' : 'bg-md-outline';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={props['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group inline-flex h-8 w-13 shrink-0 items-center rounded-full border-2 px-1 outline-none transition-[background-color,border-color] duration-(--duration-effects-default) focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 disabled:pointer-events-none',
        checked ? 'justify-end' : 'justify-start',
        trackClass,
        className,
      )}
    >
      <span className="relative flex items-center justify-center">
        {!disabled && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute -inset-2.5 rounded-full opacity-0 transition-opacity duration-(--duration-effects-fast) group-hover:opacity-(--opacity-state-hover) group-focus-visible:opacity-(--opacity-state-focus) group-active:opacity-(--opacity-state-pressed)',
              checked ? 'bg-md-primary' : 'bg-md-on-surface-variant',
            )}
          />
        )}
        <span
          className={cn(
            'relative z-10 flex items-center justify-center rounded-full transition-[width,height,background-color] duration-(--duration-effects-default)',
            checked ? 'h-6 w-6' : 'h-4 w-4',
            thumbClass,
          )}
        >
          {checked && (
            <MdCheck
              aria-hidden="true"
              className={cn('h-3.5 w-3.5', disabled ? 'text-md-surface' : 'text-md-primary')}
            />
          )}
        </span>
      </span>
    </button>
  );
}
