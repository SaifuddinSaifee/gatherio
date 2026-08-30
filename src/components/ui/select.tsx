import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  supportingText?: string;
}

/**
 * Filled select, styled to match TextField (design-revised.md §37-39) so
 * the two read as one field family in a form. Native <select> semantics
 * are kept rather than a custom listbox — no keyboard/a11y reimplementation
 * needed for a plain single-choice control.
 */
export function Select({ label, id, name, className, supportingText, children, ...props }: SelectProps) {
  const fieldId = id ?? name;
  const supportId = fieldId ? `${fieldId}-supporting` : undefined;

  return (
    <div>
      <label htmlFor={fieldId} className="block">
        <span className="mb-1 block text-body-small text-md-on-surface-variant">{label}</span>
        <select
          id={fieldId}
          name={name}
          aria-describedby={supportId}
          className={cn(
            'h-14 w-full rounded-t-xs border-b-2 border-md-outline bg-md-surface-container-low px-4 text-body-large text-md-on-surface outline-none transition-colors duration-(--duration-effects-default) focus:border-md-primary focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 disabled:border-md-outline/38 disabled:bg-md-on-surface/12 disabled:text-md-on-surface/38',
            className,
          )}
          {...props}
        >
          {children}
        </select>
      </label>
      {supportingText && (
        <p id={supportId} className="mt-1 text-body-small text-md-on-surface-variant">
          {supportingText}
        </p>
      )}
    </div>
  );
}
