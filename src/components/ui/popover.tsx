'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PopoverProps {
  /** Content of the trigger button. */
  trigger: ReactNode;
  triggerClassName: string;
  /** Accessible name when the trigger's visible content isn't a complete label on its own. */
  triggerLabel?: string;
  align?: 'start' | 'end';
  panelClassName?: string;
  children: ReactNode;
}

/**
 * A disclosure button that opens a floating panel (design-revised.md §45
 * menu surface: surface-container, level-2 elevation, 4px corners). It is
 * deliberately *not* an ARIA `menu`: its contents are ordinary controls
 * (checkboxes, buttons) that keep their own semantics and Tab order,
 * which is simpler to get right than roving focus in a menu. Escape and
 * an outside click both close it; Escape returns focus to the trigger.
 */
export function Popover({ trigger, triggerClassName, triggerLabel, align = 'start', panelClassName, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    panelRef.current?.querySelector<HTMLElement>('input, button, [href], select, textarea')?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={triggerLabel}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className={cn(
            'absolute top-full z-30 mt-1 min-w-56 rounded-xs bg-md-surface-container py-2 shadow-elevation-2',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
