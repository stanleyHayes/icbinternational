'use client';

/**
 * The search box above a list.
 *
 * A real label, visually hidden, rather than a placeholder standing in for one: a placeholder
 * disappears the moment somebody types, which leaves a screen-reader user — and anyone who looked
 * away mid-sentence — with an unlabelled box. `type="search"` so the browser offers its own clear
 * control and mobile keyboards show a search key.
 */

import { Search } from 'lucide-react';

import { cn, Input, Label } from '@reliance/ui';

/** Props for {@link SearchField}. */
export interface SearchFieldProps {
  /** What is being searched — "Search payees". Hidden visually, read by assistive tech. */
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly id: string;
  readonly className?: string;
}

/**
 * @example <SearchField id="payee-search" label="Search payees" value={q} onChange={setQ} />
 */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  id,
  className,
}: SearchFieldProps) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder ?? label}
        onChange={(event) => onChange(event.target.value)}
        prefix={<Search aria-hidden="true" className="size-4" />}
      />
    </div>
  );
}
