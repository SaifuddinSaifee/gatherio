'use client';

import { useEffect, useRef, type InputHTMLAttributes } from 'react';
import { MdCheck, MdRemove } from 'react-icons/md';
import { cn } from '@/lib/cn';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The "some but not all" state of a select-all box. Only settable from script, so it lives in a prop. */
  indeterminate?: boolean;
}

/**
 * Material 3 checkbox (m3.material.io/components/checkbox). A real native
 * `<input type="checkbox">` with its own appearance removed, so keyboard,
 * form submission, and screen-reader semantics are the browser's rather
 * than reimplemented. 18px box inside a 40px target, a circular state
 * layer per §9, and a check or dash glyph so state is never colour-only
 * (§72). Label it with a wrapping `<label>` or `aria-label`.
 */
export function Checkbox({ indeterminate = false, className, disabled, ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const marked = indeterminate || Boolean(props.checked);

  return (
    <span className={cn('group relative inline-flex h-10 w-10 shrink-0 items-center justify-center', className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-md-on-surface opacity-0 transition-opacity duration-(--duration-effects-fast) group-hover:opacity-(--opacity-state-hover) group-has-[:active]:opacity-(--opacity-state-pressed) group-has-[:disabled]:opacity-0"
      />
      <input
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className={cn(
          'peer relative h-4.5 w-4.5 cursor-pointer appearance-none rounded-[2px] border-2 outline-none transition-colors duration-(--duration-effects-fast) focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed',
          marked
            ? 'border-md-primary bg-md-primary disabled:border-transparent disabled:bg-md-on-surface/38'
            : 'border-md-on-surface-variant bg-transparent disabled:border-md-on-surface/38',
        )}
        {...props}
      />
      {marked && (
        <span aria-hidden="true" className="pointer-events-none absolute text-md-on-primary">
          {indeterminate ? <MdRemove className="h-4 w-4" /> : <MdCheck className="h-4 w-4" />}
        </span>
      )}
    </span>
  );
}
