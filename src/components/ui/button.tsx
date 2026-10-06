import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 'md' (default) is the standard Material button. 'sm' is for dense contexts — a table toolbar, a row's inline actions. */
  size?: ButtonSize;
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

const SIZE_STYLES: Record<ButtonSize, string> = {
  md: 'h-10 gap-2 px-6 text-button',
  sm: 'h-8 gap-1.5 px-4 text-button-sm',
};

function buttonClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean | undefined,
  className: string | undefined,
) {
  const styles = VARIANT_STYLES[variant];
  return cn(
    'group relative inline-flex cursor-pointer items-center justify-center rounded-full font-medium transition-shadow duration-(--duration-effects-default) ease-md-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-md-on-surface/12 disabled:text-md-on-surface/38 disabled:shadow-elevation-0',
    SIZE_STYLES[size],
    fullWidth && 'w-full',
    styles.container,
    styles.elevation,
    className,
  );
}

function ButtonContent({ variant, children }: { variant: ButtonVariant; children: ReactNode }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-(--duration-effects-fast) group-hover:opacity-(--opacity-state-hover) group-active:opacity-(--opacity-state-pressed) ${VARIANT_STYLES[variant].stateLayer}`}
      />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </>
  );
}

export function Button({
  variant = 'filled',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={buttonClassName(variant, size, fullWidth, className)} {...props}>
      <ButtonContent variant={variant}>{children}</ButtonContent>
    </button>
  );
}

type ButtonLinkProps<RouteType> = Omit<
  ComponentProps<typeof Link<RouteType>>,
  'className' | 'children'
> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
};

/** A navigation that looks like a button — a real link, never a `<button>` nested inside an `<a>`. */
export function ButtonLink<RouteType>({
  variant = 'filled',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: ButtonLinkProps<RouteType>) {
  return (
    <Link className={buttonClassName(variant, size, fullWidth, className)} {...props}>
      <ButtonContent variant={variant}>{children}</ButtonContent>
    </Link>
  );
}
