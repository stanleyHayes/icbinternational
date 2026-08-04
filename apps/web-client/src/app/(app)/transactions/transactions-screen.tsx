'use client';

/**
 * The activity screen.
 *
 * The query string is the only source of truth for what is shown. Nothing here holds a filter in
 * component state, which is what makes the address bar a complete description of the view: paste
 * the link into a support ticket and the adviser sees the same rows, in the same order, with the
 * same totals.
 *
 * The shell's account switcher is kept in step in one direction only — the URL tells the switcher
 * which account is on screen, never the other way round. A switcher that silently rewrote the
 * query string would mean a link shared between two customers showed each of them something
 * different, which is exactly the failure the URL-first design exists to prevent.
 */

import { useEffect } from 'react';

import { useAccounts } from '@/components/accounts/use-accounts';
import { FacetPanel } from '@/components/transactions/facet-panel';
import { FilterBar } from '@/components/transactions/filter-bar';
import { BASE_CURRENCY } from '@/components/transactions/totals';
import { TransactionFeed } from '@/components/transactions/transaction-feed';
import { useFilterNavigation } from '@/components/transactions/use-filter-navigation';
import { WindowSummary } from '@/components/transactions/window-summary';
import { useSelectedAccount } from '@/lib/selected-account';

/** The activity list, its filters and the totals that reconcile with it. */
export function TransactionsScreen() {
  const { filters, patchFilters, clearFilters } = useFilterNavigation();
  const accounts = useAccounts();
  const { accountId: shellAccountId, select } = useSelectedAccount();

  const scoped = accounts.data?.find((account) => account.id === filters.accountId);
  const currency = scoped?.currency ?? BASE_CURRENCY;

  useEffect(() => {
    if (filters.accountId && filters.accountId !== shellAccountId) select(filters.accountId);
  }, [filters.accountId, shellAccountId, select]);

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        filters={filters}
        onChange={patchFilters}
        onClear={clearFilters}
        accounts={accounts.data ?? []}
        currency={currency}
      />
      <FacetPanel filters={filters} onChange={patchFilters} />
      <WindowSummary filters={filters} currency={currency} />
      <TransactionFeed filters={filters} onClearFilters={clearFilters} withBalance />
    </div>
  );
}
