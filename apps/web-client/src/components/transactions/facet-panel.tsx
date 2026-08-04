'use client';

/**
 * Faceted narrowing: the categories and statuses actually present in the current results.
 *
 * The counts are computed over the results *ignoring the facet being offered*, which is what
 * makes a facet usable. Counting within the current selection would show "Groceries 41" and
 * nothing else the moment Groceries was chosen, leaving no way to see that there are also 12
 * transport payments to switch to.
 *
 * Each chip is a toggle with `aria-pressed`, so a screen reader announces the state rather than
 * relying on the tint that carries it visually.
 */

import { useMemo } from 'react';

import type { SpendCategory, TransactionStatus } from '@reliance/contracts';
import { Badge, cn, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

import type { TransactionFilters } from './filters';
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_ORDER } from './labels';
import { facetCounts } from './totals';
import { useTransactionWindow } from './use-transactions';

/** Facets worth offering; below this a chip is noise rather than a shortcut. */
const MIN_COUNT = 1;

/** Categories shown before the list is collapsed. */
const MAX_CATEGORY_CHIPS = 8;

interface ChipProps {
  readonly label: string;
  readonly count: number;
  readonly selected: boolean;
  readonly onToggle: () => void;
}

function Chip({ label, count, selected, onToggle }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'rounded-pill inline-flex items-center gap-2 border px-3 py-1.5 text-sm font-medium',
        selected
          ? 'border-accent bg-accent-soft text-fg'
          : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
        FOCUS_RING,
        TRANSITION_STATE,
      )}
    >
      {label}
      <Badge tone={selected ? 'accent' : 'neutral'} size="sm">
        {count}
      </Badge>
    </button>
  );
}

function useCategoryFacets(filters: TransactionFilters) {
  const withoutCategory = useMemo(() => ({ ...filters, category: null }), [filters]);
  const window = useTransactionWindow(withoutCategory);
  const rows = window.data?.transactions;

  return useMemo(() => {
    if (!rows) return [];
    const counts = facetCounts(rows, (transaction) => transaction.category);
    return Object.entries(counts)
      .filter(([, count]) => count >= MIN_COUNT)
      .sort(([, left], [, right]) => right - left)
      .slice(0, MAX_CATEGORY_CHIPS)
      .map(([category, count]) => ({ category: category as SpendCategory, count }));
  }, [rows]);
}

function useStatusFacets(filters: TransactionFilters) {
  const withoutStatus = useMemo(() => ({ ...filters, status: null }), [filters]);
  const window = useTransactionWindow(withoutStatus);
  const rows = window.data?.transactions;

  return useMemo(() => {
    if (!rows) return [];
    const counts = facetCounts(rows, (transaction) => transaction.status);
    return STATUS_ORDER.filter((status) => (counts[status] ?? 0) >= MIN_COUNT).map((status) => ({
      status,
      count: counts[status] ?? 0,
    }));
  }, [rows]);
}

/** Props for {@link FacetPanel}. */
export interface FacetPanelProps {
  readonly filters: TransactionFilters;
  readonly onChange: (changes: Partial<TransactionFilters>) => void;
}

/**
 * @example <FacetPanel filters={filters} onChange={patchFilters} />
 */
export function FacetPanel({ filters, onChange }: FacetPanelProps) {
  const categories = useCategoryFacets(filters);
  const statuses = useStatusFacets(filters);

  if (categories.length === 0 && statuses.length === 0) return null;

  const toggleCategory = (category: SpendCategory): void =>
    onChange({ category: filters.category === category ? null : category });

  const toggleStatus = (status: TransactionStatus): void =>
    onChange({ status: filters.status === status ? null : status });

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Narrow by category</legend>
        {categories.map(({ category, count }) => (
          <Chip
            key={category}
            label={CATEGORY_LABEL[category]}
            count={count}
            selected={filters.category === category}
            onToggle={() => toggleCategory(category)}
          />
        ))}
      </fieldset>

      {statuses.length > 1 ? (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Narrow by status</legend>
          {statuses.map(({ status, count }) => (
            <Chip
              key={status}
              label={STATUS_LABEL[status]}
              count={count}
              selected={filters.status === status}
              onToggle={() => toggleStatus(status)}
            />
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
