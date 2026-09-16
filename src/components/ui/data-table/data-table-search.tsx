'use client';

import { MdClose, MdSearch } from 'react-icons/md';
import { cn } from '@/lib/cn';

interface DataTableSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name; also the placeholder. Say what's searched, e.g. "Search cases or recipients". */
  label: string;
  className?: string;
}

/** A compact search field for a table toolbar (design-revised.md §50: clear query state and a clear action). */
export function DataTableSearch({ value, onChange, label, className }: DataTableSearchProps) {
  return (
    <div className={cn('relative flex h-10 items-center', className)}>
      <MdSearch aria-hidden="true" className="pointer-events-none absolute left-3 h-5 w-5 text-md-on-surface-variant" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={label}
        className="h-full w-full rounded-full bg-md-surface-container-high pr-10 pl-10 text-body-medium text-md-on-surface outline-none placeholder:text-md-on-surface-variant focus-visible:ring-2 focus-visible:ring-md-primary [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-md-on-surface-variant outline-none hover:bg-md-surface-container-highest focus-visible:ring-2 focus-visible:ring-md-primary"
        >
          <MdClose aria-hidden="true" className="h-4.5 w-4.5" />
        </button>
      )}
    </div>
  );
}
