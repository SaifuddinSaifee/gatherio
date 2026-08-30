import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

/**
 * Material Button (design-revised.md §25-31). Four of the five standard
 * variants — Elevated is omitted until something actually needs the
 * "separation from surface" it's for (§28 warns against reaching for
 * elevation just because a layout feels flat).
 *
 * State feedback follows §9's model precisely: a separate semi-
 * transparent overlay at the §9 opacity tokens, laid on top of an
 * unchanged base container — never by lowering the container's own
 * background alpha (bg-primary/90 was the old, now-corrected pattern).
 * No scale-based press feedback (§24) — state-layer + elevation is the
 * preferred feedback order before spatial feedback.
 */
const VARIANT_STYLES: Record<
  ButtonVariant,
  { container: string; stateLayer: string; elevation?: string }
> = {
  filled: {
    container: 'bg-md-primary text-md-on-primary',
    stateLayer: 'bg-md-on-primary',
    elevation: 'shadow-elevation-0 hover:shadow-elevation-1',
  },
  tonal: {
    container: 'bg-md-secondary-container text-md-on-secondary-container',
    stateLayer: 'bg-md-on-secondary-container',
  },
  outlined: {
    container: 'border border-md-outline text-md-primary',
    stateLayer: 'bg-md-primary',
  },
  text: {
    container: 'text-md-primary',
    stateLayer: 'bg-md-primary',
  },
};

export function Button({
  variant = 'filled',
  fullWidth,
  className,
  children,
  ...props
}: ButtonProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <button
      className={cn(
        'group relative inline-flex h-10 items-center justify-center gap-2 rounded-full px-6 text-label-large font-medium transition-shadow duration-(--duration-effects-default) ease-md-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-md-on-surface/12 disabled:text-md-on-surface/38 disabled:shadow-elevation-0',
        fullWidth && 'w-full',
        styles.container,
        styles.elevation,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-(--duration-effects-fast) group-hover:opacity-(--opacity-state-hover) group-active:opacity-(--opacity-state-pressed) ${styles.stateLayer}`}
      />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
