import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/**
 * Material 3 filled text field (design.md's Inputs section): rounded top
 * corners, square bottom, 2px bottom border that goes Primary on focus.
 * First real cut of Stage 10's TextField primitive — built here because
 * Stage 4's sign-up/sign-in forms are its first consumer.
 */
export function TextField({ label, id, name, className, ...props }: TextFieldProps) {
  const fieldId = id ?? name;
  return (
    <label htmlFor={fieldId} className="block">
      <span className="mb-1 block text-sm text-md-on-surface-variant">{label}</span>
      <input
        id={fieldId}
        name={name}
        className={`h-14 w-full rounded-t-md-sm border-b-2 border-md-outline bg-md-surface-container-low px-4 text-md-on-background outline-none transition-colors duration-200 focus:border-md-primary focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 ${className ?? ''}`}
        {...props}
      />
    </label>
  );
}
