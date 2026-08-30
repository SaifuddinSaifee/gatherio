import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
  supportingText?: string;
}

/**
 * Material filled text field (design-revised.md §37-39). Top-corner
 * radius is "extra-small" (4px) — the canonical M3 filled-field shape,
 * corrected from the earlier design.md's arbitrary 12px guess. Bottom
 * indicator (1px rest / 2px focus, §38) uses Outline at rest and Primary
 * or Error on focus depending on validity.
 *
 * Errors are never color-only (§39, §72): the error message is prefixed
 * in text, not just tinted, and is programmatically associated via
 * aria-describedby + aria-invalid, not just visually placed nearby.
 *
 * Known gap: the label sits statically above the field rather than
 * animating as a true floating label — tracked in CHECKLIST.md rather
 * than solved here, since it's a real (if secondary) piece of §38's
 * anatomy this component doesn't yet implement.
 */
export function TextField({
  label,
  id,
  name,
  className,
  errorMessage,
  supportingText,
  ...props
}: TextFieldProps) {
  const fieldId = id ?? name;
  const hasError = Boolean(errorMessage);
  const supportId = fieldId ? `${fieldId}-supporting` : undefined;

  return (
    <div>
      <label htmlFor={fieldId} className="block">
        <span className="mb-1 block text-body-small text-md-on-surface-variant">{label}</span>
        <input
          id={fieldId}
          name={name}
          aria-invalid={hasError || undefined}
          aria-describedby={supportId}
          className={cn(
            'h-14 w-full rounded-t-xs border-b-2 bg-md-surface-container-low px-4 text-body-large text-md-on-surface outline-none transition-colors duration-(--duration-effects-default) focus-visible:ring-2 focus-visible:ring-offset-2 disabled:border-md-outline/38 disabled:bg-md-on-surface/12 disabled:text-md-on-surface/38',
            hasError
              ? 'border-md-error focus:border-md-error focus-visible:ring-md-error'
              : 'border-md-outline focus:border-md-primary focus-visible:ring-md-primary',
            className,
          )}
          {...props}
        />
      </label>
      {(errorMessage || supportingText) && (
        <p
          id={supportId}
          className={`mt-1 text-body-small ${hasError ? 'text-md-error' : 'text-md-on-surface-variant'}`}
        >
          {hasError ? `Error: ${errorMessage}` : supportingText}
        </p>
      )}
    </div>
  );
}
