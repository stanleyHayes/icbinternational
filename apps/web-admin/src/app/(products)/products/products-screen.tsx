/**
 * The product catalogue.
 *
 * Every version of every product, current and superseded. Filtering defaults to the
 * versions in force, because that is what a pricing conversation is about — but the
 * history is one filter away, because a complaint about a fee charged in March is about a
 * version that is no longer current.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AccountType, type Product } from '@reliance/contracts';

import { KpiTile, OpsScreen, RegisterPanel, opsKeys } from '@/components/ops';
import { FilterBar, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount, humaniseCode } from '@/lib/format';

import { productColumns } from './product-columns';
import { ProductEditor } from './product-editor';

/** Products read per page. */
const PAGE_SIZE = 100;

/** Filter value meaning "only the version in force". */
const CURRENT_ONLY = 'current';

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'version',
    label: 'Versions',
    kind: 'select',
    options: [
      { value: CURRENT_ONLY, label: 'In force' },
      { value: 'superseded', label: 'Superseded' },
    ],
  },
  {
    id: 'accountType',
    label: 'Account type',
    kind: 'select',
    options: Object.values(AccountType).map((value) => ({ value, label: humaniseCode(value) })),
  },
  { id: 'search', label: 'Name or code', kind: 'text', placeholder: 'Search the catalogue' },
];

function matches(product: Product, filters: Readonly<Record<string, string>>): boolean {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const inForce = product.effectiveTo === null;

  if (filters.version === CURRENT_ONLY && !inForce) return false;
  if (filters.version === 'superseded' && inForce) return false;
  if (filters.accountType && product.accountType !== filters.accountType) return false;

  return search === '' || `${product.name} ${product.code}`.toLowerCase().includes(search);
}

/** The catalogue and the editor behind it. */
/**
 * The shape of the catalogue.
 *
 * "In force" is a version with no supersession date; "on record" counts every version ever
 * published, because a fee charged two years ago has to remain explainable.
 */
function CatalogueFigures({ all }: { readonly all: readonly Product[] }) {
  const inForce = all.filter((product) => product.effectiveTo === null);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiTile
        label="Products in force"
        value={formatCount(inForce.length)}
        hint="Versions with no supersession date."
      />
      <KpiTile
        label="Open to new customers"
        value={formatCount(inForce.filter((product) => product.active).length)}
        hint="Available to open today. The rest are closed to new business."
      />
      <KpiTile
        label="Versions on record"
        value={formatCount(all.length)}
        hint="Every version ever published, so a historical fee can always be explained."
      />
    </div>
  );
}

export function ProductsScreen() {
  const client = useApiClient();
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({
    version: CURRENT_ONLY,
  });
  const [editing, setEditing] = useState<Product | null>(null);

  const query = useQuery({
    queryKey: opsKeys.products(),
    queryFn: async ({ signal }) => client.admin.products({ limit: PAGE_SIZE }, { signal }),
  });

  // Memoised on `query.data` rather than on `all`: `?? []` builds a fresh array on every
  // render while the query is empty, so an `all` dependency would defeat the memo it is
  // meant to key.
  const all = useMemo(() => query.data?.data ?? [], [query.data]);
  const rows = useMemo(() => all.filter((product) => matches(product, filters)), [all, filters]);

  return (
    <OpsScreen
      title="Product studio"
      description="Rates, fees, limits and effective-dated versions. Repricing supersedes a product; it never edits one in place."
    >
      <CatalogueFigures all={all} />

      <RegisterPanel
        title="Catalogue"
        description="Filtered to the versions in force by default."
        query={query}
        subject="the product catalogue"
        tableId="ops-products"
        caption="Product versions"
        rowNoun="products"
        columns={productColumns(setEditing)}
        rows={rows}
        rowKey={(row) => `${row.code}:${String(row.version)}`}
        totalCount={query.data?.page.total}
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        filterValues={filters}
        onFilterValuesChange={setFilters}
        exportName="products"
        filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
      />

      <ProductEditor product={editing} onClose={() => setEditing(null)} />
    </OpsScreen>
  );
}
