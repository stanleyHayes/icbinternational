'use client';

/**
 * The filter controls above the activity list.
 *
 * Search is a real form that submits, rather than a box that refetches on every keystroke. On a
 * list this long a per-keystroke search means the results shift under the customer while they are
 * still typing the payee's name, and every intermediate query is a request the bank paid for.
 * Enter, or the button, and the URL changes once.
 *
 * The rest of the filters live behind a disclosure so the page opens on the activity rather than
 * on a control panel. The count in the summary says how many are on, because a filtered list that
 * looks unfiltered is how somebody concludes a payment has vanished.
 */

import { Search, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import type { Account } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { Badge, Button, FormField, Input } from '@reliance/ui';

import { FilterFields } from './filter-fields';
import { activeFilterCount, type TransactionFilters } from './filters';

/** Props for {@link FilterBar}. */
export interface FilterBarProps {
  readonly filters: TransactionFilters;
  readonly onChange: (changes: Partial<TransactionFilters>) => void;
  readonly onClear: () => void;
  readonly accounts: readonly Account[];
  readonly currency: CurrencyCode;
}

function SearchField({
  value,
  onSubmit,
}: {
  readonly value: string;
  readonly onSubmit: (search: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onSubmit(draft.trim());
  };

  return (
    <form onSubmit={submit} className="flex flex-1 items-end gap-2" role="search">
      <FormField label="Search your activity" className="min-w-48 flex-1">
        <Input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          prefix={<Search aria-hidden="true" className="size-4" />}
          autoComplete="off"
        />
      </FormField>
      <Button type="submit" variant="secondary" className="mb-px">
        Search
      </Button>
    </form>
  );
}

const SUMMARY_CLASSES =
  'cursor-pointer list-none px-4 py-3 text-sm font-medium text-fg marker:hidden ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus';

/** The disclosure holding everything that is not the search box. */
function MoreFilters({
  active,
  children,
}: {
  readonly active: number;
  readonly children: ReactNode;
}) {
  return (
    <details className="border-border bg-surface rounded-lg border">
      <summary className={SUMMARY_CLASSES}>
        <span className="inline-flex items-center gap-2">
          Dates, amounts and more
          {active > 0 ? (
            <Badge tone="accent">{`${active} applied`}</Badge>
          ) : (
            <Badge tone="neutral">None applied</Badge>
          )}
        </span>
      </summary>
      <div className="border-border border-t p-4">{children}</div>
    </details>
  );
}

/**
 * @example <FilterBar filters={filters} onChange={patchFilters} onClear={clearFilters} … />
 */
export function FilterBar({ filters, onChange, onClear, accounts, currency }: FilterBarProps) {
  const active = activeFilterCount(filters);

  return (
    <section aria-label="Filter your activity" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* Keyed on the URL's search term: when a category chip or a shared link rewrites the
            filters, the box is remounted with the new value rather than an effect copying it
            into state after the fact. */}
        <SearchField
          key={filters.search}
          value={filters.search}
          onSubmit={(search) => onChange({ search })}
        />
        {active > 0 ? (
          <Button
            variant="ghost"
            onClick={onClear}
            startIcon={<X aria-hidden="true" className="size-4" />}
            className="mb-px"
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <MoreFilters active={active}>
        <FilterFields
          filters={filters}
          onChange={onChange}
          accounts={accounts}
          currency={currency}
        />
      </MoreFilters>
    </section>
  );
}
