import { Saira_Extra_Condensed } from 'next/font/google';
import { cn } from '@/lib/cn';

/**
 * The logo font — Saira Extra Condensed Bold, per design-revised.md §15.
 * Scoped to this component only; never apply this to headings, buttons,
 * or body copy elsewhere.
 */
const logoFont = Saira_Extra_Condensed({
  subsets: ['latin'],
  weight: '700',
  display: 'swap',
});

interface LogoProps {
  className?: string;
  /** On-Primary/white — for display over dark or brand-colored surfaces (§15). */
  reversed?: boolean;
}

/**
 * The GATHER wordmark. Always uppercase, never "Gather" or "Gather.io"
 * (§15). Size is caller-controlled via className — marketing surfaces use
 * a display/headline size, nav headers use ~24-28px apparent cap height.
 */
export function Logo({ className, reversed }: LogoProps) {
  return (
    <span
      className={cn(
        logoFont.className,
        'tracking-[-0.01em]',
        reversed ? 'text-md-on-primary' : 'text-md-primary',
        className,
      )}
    >
      GATHER
    </span>
  );
}
