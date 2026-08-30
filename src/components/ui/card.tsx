import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type CardVariant = 'filled' | 'outlined';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

/**
 * Material Card (design-revised.md §34-36). Filled and Outlined only —
 * Elevated is omitted until something needs actual separation from its
 * surface. Shape defaults to "medium" (12px), the standard-card baseline
 * for ordinary product UI (§35) — NOT the 24px "large" tier the earlier
 * design.md applied to every card; that's reserved for marketing/hero
 * surfaces (§81).
 *
 * This component is non-interactive by construction: no hover shadow,
 * no hover scale. A card that IS meant to be clickable should compose
 * its own interaction affordances rather than getting them for free here
 * (§36: "a non-interactive card should not pretend to be clickable").
 */
const VARIANT_STYLES: Record<CardVariant, string> = {
  filled: 'bg-md-surface-container shadow-elevation-0',
  outlined: 'bg-md-surface border border-md-outline-variant shadow-elevation-0',
};

export function Card({ variant = 'filled', className, children, ...props }: CardProps) {
  return (
    <div className={cn('rounded-md p-6', VARIANT_STYLES[variant], className)} {...props}>
      {children}
    </div>
  );
}
