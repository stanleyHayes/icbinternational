'use client';

/**
 * The biller directory.
 *
 * Searched server-side rather than filtered in the browser, because the directory is long and a
 * customer typing "thames" wants the water company whether or not it happened to be on the first
 * page. The category is on each row: two billers with similar names are told apart by it.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import type { Biller } from '@reliance/contracts';
import { Badge, cn } from '@reliance/ui';

import { NoResultsPanel } from '@/components/shell';
import { laneRoutes, movementKeys, QueryPanel, SearchField, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

const CATEGORY_WORDS: Readonly<Record<string, string>> = {
  ELECTRICITY: 'Electricity',
  WATER: 'Water',
  GAS: 'Gas',
  INTERNET: 'Broadband',
  MOBILE: 'Mobile',
  TV: 'TV',
  INSURANCE: 'Insurance',
  COUNCIL_TAX: 'Council tax',
  EDUCATION: 'Education',
  CHARITY: 'Charity',
  OTHER: 'Other',
};

function BillerRow({ biller }: { readonly biller: Biller }) {
  return (
    <li>
      <Link
        href={laneRoutes.payments.biller(biller.id)}
        className={cn(
          'hover:bg-surface-sunken flex items-center justify-between gap-3 rounded-md px-3 py-3',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">{biller.name}</span>
          <span className="text-fg-muted mt-0.5 block text-xs">{biller.accountNumberLabel}</span>
        </span>
        <Badge tone="neutral">{CATEGORY_WORDS[biller.category] ?? biller.category}</Badge>
      </Link>
    </li>
  );
}

/**
 * @example <BillerCatalogue />
 */
export function BillerCatalogue() {
  const [search, setSearch] = useState('');
  const filters = search ? { search } : {};

  const billers = useQuery({
    queryKey: movementKeys.payments.billers(filters),
    queryFn: async () => (await browserApi().payments.listBillers(filters)).data,
  });

  return (
    <Section title="Who are you paying?" description="Search the companies we can pay directly.">
      <div className="mb-4">
        <SearchField
          id="biller-search"
          label="Search billers"
          placeholder="Search by company name"
          value={search}
          onChange={setSearch}
        />
      </div>

      <QueryPanel
        query={billers}
        skeletonRows={4}
        isEmpty={(list) => list.length === 0}
        empty={<NoResultsPanel query={search} />}
      >
        {(list) => (
          <ul className="divide-border -mx-3 flex flex-col divide-y">
            {list.map((biller) => (
              <BillerRow key={biller.id} biller={biller} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
