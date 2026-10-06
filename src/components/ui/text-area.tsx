import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  errorMessage?: string;
  supportingText?: string;
}

/**
 * Material filled text field's multiline sibling (design-revised.md
 * §37-39) — same visual language as `TextField` (filled container,
 * extra-small top-corner radius, Outline-at-rest/Primary-or-Error-on-
 * focus bottom indicator, text-prefixed error so color isn't the only
 * indicator), built as its own component because a `<textarea>` needs
 * `rows` and grows vertically rather than sitting at a fixed height.
 *
 * Stage 7: extracted for the review-changes reason field — the fifth
 * hand-rolled textarea in the app (design §84 names this as the point to
 * extract a primitive). The four earlier ones (the requirement-answer
 * `AnswerField`, the template builders' instructions/acceptance-criteria/
 * options fields) are left as they are; migrating them is cleanup, not
 * Stage 7 (CHECKLIST known gap).
 */
export function TextArea({
  label,
  id,
  name,
  className,
  errorMessage,
  supportingText,
  rows = 4,
  ...props
}: TextAreaProps) {
  const fieldId = id ?? name;
  const hasError = Boolean(errorMessage);
  const supportId = fieldId ? `${fieldId}-supporting` : undefined;

  return (
    <div>
      <label htmlFor={fieldId} className="block">
        <span className="mb-1 block text-body-small text-md-on-surface-variant">{label}</span>
        <textarea
          id={fieldId}
          name={name}
          rows={rows}
          aria-invalid={hasError || undefined}
          aria-describedby={supportId}
          className={cn(
            'w-full rounded-t-xs border-b-2 bg-md-surface-container-low px-4 py-3 text-body-large text-md-on-surface outline-none transition-colors duration-(--duration-effects-default) focus-visible:ring-2 focus-visible:ring-offset-2 disabled:border-md-outline/38 disabled:bg-md-on-surface/12 disabled:text-md-on-surface/38',
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
