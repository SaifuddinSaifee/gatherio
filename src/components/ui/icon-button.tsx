import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon alone has no accessible name (design-revised.md §32, §75). */
  'aria-label': string;
}

/**
 * Material 3 standard icon button (§32): a 40px circular target with a
 * state layer and no container. Pass one `aria-hidden` icon as children.
 */
export function IconButton({ className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'group relative inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-md-on-surface-variant outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-md-on-surface/38',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-md-on-surface-variant opacity-0 transition-opacity duration-(--duration-effects-fast) group-hover:opacity-(--opacity-state-hover) group-active:opacity-(--opacity-state-pressed)"
      />
      <span className="relative z-10 inline-flex">{children}</span>
    </button>
  );
}
