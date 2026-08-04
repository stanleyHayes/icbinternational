/**
 * The page list.
 *
 * Publish state is the column editors scan, so it sits next to the title rather than at
 * the end of a wide row. A page in review with nobody looking at it is the commonest way
 * a launch slips, and this is where that becomes visible.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Permission, PublishStatus, type CmsPage } from '@reliance/contracts';
import { Button, StatusPill } from '@reliance/ui';

import { Panel, QueryState, opsKeys, toneForPublish } from '@/components/ops';
import { DataTable, FilterBar, type DataColumn, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatInstant, humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';

import { PageEditor } from './page-editor';

/** Pages read per page. */
const PAGE_SIZE = 100;

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'Publish state',
    kind: 'select',
    options: Object.values(PublishStatus).map((value) => ({ value, label: humaniseCode(value) })),
  },
  { id: 'search', label: 'Title or address', kind: 'text', placeholder: 'Search pages' },
];

/** What the page is and where it has got to. */
const PAGE_COLUMNS: readonly DataColumn<CmsPage>[] = [
  {
    id: 'title',
    header: 'Page',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium">{row.title}</span>
        <span className="text-fg-muted font-mono text-xs">/{row.slug}</span>
      </span>
    ),
    csv: (row) => `${row.title} (/${row.slug})`,
    sortValue: (row) => row.title,
  },
  {
    id: 'status',
    header: 'State',
    alwaysVisible: true,
    cell: (row) => (
      <StatusPill tone={toneForPublish(row.status)} label={humaniseCode(row.status)} />
    ),
    csv: (row) => row.status,
    sortValue: (row) => row.status,
  },
  {
    id: 'blocks',
    header: 'Blocks',
    align: 'end',
    cell: (row) => row.blocks.length,
    csv: (row) => String(row.blocks.length),
    sortValue: (row) => row.blocks.length,
  },
  {
    id: 'noIndex',
    header: 'In search',
    cell: (row) => (row.seo.noIndex ? 'Hidden' : 'Listed'),
    csv: (row) => (row.seo.noIndex ? 'hidden' : 'listed'),
  },
  {
    id: 'publishedAt',
    header: 'Published (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.publishedAt)}</span>,
    csv: (row) => row.publishedAt ?? '',
    sortValue: (row) => row.publishedAt ?? '',
  },
  {
    id: 'updatedAt',
    header: 'Last edited (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.updatedAt)}</span>,
    csv: (row) => row.updatedAt,
    sortValue: (row) => row.updatedAt,
  },
];

function columns(onOpen: (page: CmsPage) => void): readonly DataColumn<CmsPage>[] {
  return [
    ...PAGE_COLUMNS,
    {
      id: 'open',
      header: 'Edit',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
          Open
        </Button>
      ),
      csv: (row) => row.id,
    },
  ];
}

function matches(page: CmsPage, filters: Readonly<Record<string, string>>): boolean {
  const search = filters.search?.trim().toLowerCase() ?? '';
  return (
    (!filters.status || page.status === filters.status) &&
    (search === '' || `${page.title} ${page.slug}`.toLowerCase().includes(search))
  );
}

/**
 * The page list and the one way to add to it.
 *
 * A new page opens in the editor immediately: creating it is not the intent, writing it
 * is, and a list that grows by one "Untitled page" is a worse outcome than a form.
 */
function usePages(onCreated: (page: CmsPage) => void) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: opsKeys.content('pages'),
    queryFn: async ({ signal }) => client.admin.cmsPages({ limit: PAGE_SIZE }, { signal }),
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await client.admin.createCmsPage({
          title: 'Untitled page',
          slug: 'untitled-page',
          blocks: [],
        })
      ).data,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('content') });
      onCreated(created);
    },
  });

  return { query, create };
}

type PageFilters = Readonly<Record<string, string>>;

/** The table, its filter bar, and the loading and error states around them. */
function PageTable({
  query,
  rows,
  filters,
  onFiltersChange,
  onEdit,
}: {
  readonly query: ReturnType<typeof usePages>['query'];
  readonly rows: readonly CmsPage[];
  readonly filters: PageFilters;
  readonly onFiltersChange: (next: PageFilters) => void;
  readonly onEdit: (page: CmsPage) => void;
}) {
  return (
    <QueryState query={query} subject="the page list">
      <DataTable
        tableId="ops-content-pages"
        caption="CMS pages"
        rowNoun="pages"
        columns={columns(onEdit)}
        rows={rows}
        rowKey={(row) => row.id}
        defaultSort={{ columnId: 'updatedAt', direction: 'desc' }}
        filterValues={filters}
        onFilterValuesChange={onFiltersChange}
        exportName="content-pages"
        filters={<FilterBar filters={FILTERS} values={filters} onChange={onFiltersChange} />}
      />
    </QueryState>
  );
}

/** Every CMS page, with the editor behind it. */
export function PageList() {
  const [filters, setFilters] = useState<PageFilters>({});
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const { query, create } = usePages(setEditing);

  const rows = (query.data?.data ?? []).filter((page) => matches(page, filters));

  return (
    <Panel
      title="Pages"
      description="Everything the website serves, in every publish state."
      action={
        <Can permission={Permission.CONTENT_WRITE}>
          <Button size="sm" loading={create.isPending} onClick={() => create.mutate()}>
            New page
          </Button>
        </Can>
      }
      flush
    >
      <PageTable
        query={query}
        rows={rows}
        filters={filters}
        onFiltersChange={setFilters}
        onEdit={setEditing}
      />

      <PageEditor page={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}
