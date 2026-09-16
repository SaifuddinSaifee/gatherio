import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { DESIGN_TOKENS } from './design-tokens';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [...DESIGN_TOKENS.color],
      text: [...DESIGN_TOKENS.text],
      radius: [...DESIGN_TOKENS.radius],
      shadow: [...DESIGN_TOKENS.shadow],
      ease: [...DESIGN_TOKENS.ease],
    },
  },
});

/**
 * Merges class lists with Tailwind conflict resolution — a component's
 * own default classes and a caller's override (e.g. Card's default `p-6`
 * vs. a caller's `p-8`) previously both ended up in the class attribute
 * with no defined winner. `twMerge` keeps only the last conflicting
 * utility per property group; `clsx` handles conditional/falsy values.
 * The design tokens are registered so a type-scale size and a color
 * (`text-label-small text-md-primary`) are never mistaken for a conflict.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
