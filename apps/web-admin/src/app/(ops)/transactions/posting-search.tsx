/**
 * Searching every posting in the bank.
 *
 * The filter values are the whole search: the table's saved views capture them, the CSV
 * export reflects them, and the query sent to the platform is derived from them. One
 * source of truth means an exported file can always be reconciled against the screen it
 * came from, which is most of what these exports exist for.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { Transaction } from '@reliance/contracts';

import { Panel, QueryState, opsKeys, type RetryableQuery, useSelection } from '@/components/ops';
import { DataTable, FilterBar } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';

import { BulkBar } from './bulk-bar';
import { postingColumns } from './posting-columns';
import { PostingDrawer } from './posting-drawer';
import { POSTING_FILTERS, toPostingQuery } from './posting-filters';

/** Rows read per page. Deep enough to work a morning's postings without paging. */
const PAGE_SIZE = 50;

/** The posting search, its selection, and the entry inspector behind it. */
type PostingFilterValues = Readonly<Record<string, string>>;

/** The result table, its filter bar, and the states around them. */
function PostingTable({
  query,
  totalCount,
  rows,
  columns,
  filters,
  onFiltersChange,
}: {
  readonly query: RetryableQuery;
  readonly totalCount: number | undefined;
  readonly rows: readonly Transaction[];
  readonly columns: ReturnType<typeof postingColumns>;
  readonly filters: PostingFilterValues;
  readonly onFiltersChange: (next: PostingFilterValues) => void;
}) {
  return (
    <QueryState query={query} subject="the posting search">
      <DataTable
        tableId="ops-postings"
        caption="Postings across the bank, filtered"
        rowNoun="postings"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        totalCount={totalCount}
        defaultSort={{ columnId: 'bookedAt', direction: 'desc' }}
        filterValues={filters}
        onFilterValuesChange={onFiltersChange}
        exportName="postings"
        filters={
          <FilterBar filters={POSTING_FILTERS} values={filters} onChange={onFiltersChange} />
        }
      />
    </QueryState>
  );
}

/**
 * The search itself: the query, the rows, and which of them are ticked.
 *
 * The filters are part of the query key, so a changed filter fetches rather than narrowing
 * a page that may not contain every matching posting.
 */
function usePostingSearch(filters: PostingFilterValues, onInspect: (row: Transaction) => void) {
  const client = useApiClient();
  const selection = useSelection();

  const query = useQuery({
    queryKey: opsKeys.transactions(filters),
    queryFn: async ({ signal }) =>
      client.admin.transactions(toPostingQuery(filters, PAGE_SIZE), { signal }),
  });

  const rows = query.data?.data ?? [];
  const columns = useMemo(() => postingColumns({ selection, onInspect }), [selection, onInspect]);

  // A raised reversal or a placed hold changes what the search should show.
  const refetch = (): void => {
    query.refetch();
  };

  return {
    query,
    rows,
    columns,
    selection,
    refetch,
    selected: rows.filter((row) => selection.isSelected(row.id)),
  };
}

export function PostingSearch() {
  const [filters, setFilters] = useState<PostingFilterValues>({});
  const [inspecting, setInspecting] = useState<Transaction | null>(null);
  const { query, rows, columns, selection, refetch, selected } = usePostingSearch(
    filters,
    setInspecting,
  );

  return (
    <Panel
      title="Posting search"
      description="Every posting the bank has written, across every customer account."
      flush
    >
      <div className="flex flex-col gap-3">
        <BulkBar
          selected={selected}
          onClear={selection.clear}
          onFinished={() => {
            selection.clear();
            refetch();
          }}
        />

        <PostingTable
          query={query}
          totalCount={query.data?.page.total}
          rows={rows}
          columns={columns}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>

      <PostingDrawer
        posting={inspecting}
        onClose={() => setInspecting(null)}
        onReversalRaised={refetch}
      />
    </Panel>
  );
}
