import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class lists with Tailwind conflict resolution — a component's
 * own default classes and a caller's override (e.g. Card's default `p-6`
 * vs. a caller's `p-8`) previously both ended up in the class attribute
 * with no defined winner. `twMerge` keeps only the last conflicting
 * utility per property group; `clsx` handles conditional/falsy values.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
