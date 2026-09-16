'use client';

import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from './button';

interface SubmitButtonProps extends ComponentProps<typeof Button> {
  pendingLabel?: string;
}

/**
 * The one client component Stage 8.5 needs (design decision 10) — a
 * plain `<form action={serverAction}>` still works with JS disabled, this
 * only adds a disabled state and a pending label so a slow send can't be
 * double-clicked. No other client state.
 */
export function SubmitButton({ pendingLabel, children, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
