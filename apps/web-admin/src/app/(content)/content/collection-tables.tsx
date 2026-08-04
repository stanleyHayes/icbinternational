/**
 * The collections that sit alongside pages.
 *
 * Articles, questions and branches are read-heavy: they are written elsewhere and checked
 * here. Each table therefore optimises for finding one row and seeing its publish state,
 * rather than for editing in place — editing an FAQ answer in a table cell is how a
 * half-sentence reaches the help centre.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type { Article, BankLocation, Faq } from '@reliance/contracts';
import { StatusPill } from '@reliance/ui';

import { AsyncState, opsKeys, Panel, toneForPublish } from '@/components/ops';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount, formatInstant, humaniseCode } from '@/lib/format';

/** Rows read per page. */
const PAGE_SIZE = 100;

const ARTICLE_COLUMNS: readonly DataColumn<Article>[] = [
  {
    id: 'title',
    header: 'Title',
    alwaysVisible: true,
    cell: (row) => row.title,
    csv: (row) => row.title,
  },
  { id: 'category', header: 'Category', cell: (row) => row.category, csv: (row) => row.category },
  { id: 'author', header: 'Author', cell: (row) => row.authorName, csv: (row) => row.authorName },
  {
    id: 'reading',
    header: 'Reading time',
    align: 'end',
    cell: (row) => `${String(row.readingMinutes)} min`,
    csv: (row) => String(row.readingMinutes),
    sortValue: (row) => row.readingMinutes,
  },
  {
    id: 'status',
    header: 'Status',
    alwaysVisible: true,
    cell: (row) => (
      <StatusPill tone={toneForPublish(row.status)} label={humaniseCode(row.status)} />
    ),
    csv: (row) => row.status,
  },
  {
    id: 'publishedAt',
    header: 'Published (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.publishedAt)}</span>,
    csv: (row) => row.publishedAt ?? '',
    sortValue: (row) => row.publishedAt ?? '',
  },
];

const FAQ_COLUMNS: readonly DataColumn<Faq>[] = [
  {
    id: 'question',
    header: 'Question',
    alwaysVisible: true,
    cell: (row) => row.question,
    csv: (row) => row.question,
  },
  { id: 'category', header: 'Category', cell: (row) => row.category, csv: (row) => row.category },
  {
    id: 'answer',
    header: 'Answer',
    cell: (row) => <span className="line-clamp-2">{row.answer}</span>,
    csv: (row) => row.answer,
  },
  {
    id: 'helpful',
    header: 'Marked helpful',
    align: 'end',
    cell: (row) => formatCount(row.helpfulCount),
    csv: (row) => String(row.helpfulCount),
    sortValue: (row) => row.helpfulCount,
  },
  {
    id: 'order',
    header: 'Order',
    align: 'end',
    cell: (row) => row.order,
    csv: (row) => String(row.order),
    sortValue: (row) => row.order,
  },
];

const LOCATION_COLUMNS: readonly DataColumn<BankLocation>[] = [
  {
    id: 'name',
    header: 'Branch',
    alwaysVisible: true,
    cell: (row) => row.name,
    csv: (row) => row.name,
  },
  { id: 'kind', header: 'Type', cell: (row) => humaniseCode(row.kind), csv: (row) => row.kind },
  {
    id: 'address',
    header: 'Address',
    alwaysVisible: true,
    cell: (row) => `${row.addressLine}, ${row.city} ${row.postalCode}`,
    csv: (row) => `${row.addressLine}, ${row.city} ${row.postalCode}, ${row.country}`,
  },
  {
    id: 'phone',
    header: 'Telephone',
    cell: (row) => row.phone ?? '—',
    csv: (row) => row.phone ?? '',
  },
  {
    id: 'access',
    header: 'Step-free access',
    cell: (row) => (row.wheelchairAccessible ? 'Yes' : 'No'),
    csv: (row) => (row.wheelchairAccessible ? 'yes' : 'no'),
  },
  {
    id: 'deposits',
    header: 'Deposit machine',
    cell: (row) => (row.hasDepositMachine ? 'Yes' : 'No'),
    csv: (row) => (row.hasDepositMachine ? 'yes' : 'no'),
  },
  {
    id: 'services',
    header: 'Services',
    cell: (row) => row.services.join(', '),
    csv: (row) => row.services.join(' | '),
  },
];

interface CollectionProps<T> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rowNoun: string;
  readonly columns: readonly DataColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}

function Collection<T>(props: CollectionProps<T>) {
  return (
    <Panel title={props.title} description={props.description} flush>
      <AsyncState
        isLoading={props.isLoading}
        error={props.error}
        onRetry={props.onRetry}
        subject={props.rowNoun}
      >
        <DataTable
          tableId={`ops-content-${props.id}`}
          caption={props.title}
          rowNoun={props.rowNoun}
          columns={props.columns}
          rows={props.rows}
          rowKey={props.rowKey}
          exportName={`content-${props.id}`}
        />
      </AsyncState>
    </Panel>
  );
}

/** Published and draft articles. */
export function ArticleTable() {
  const client = useApiClient();
  const query = useQuery({
    queryKey: opsKeys.content('articles'),
    queryFn: async ({ signal }) => client.admin.cmsPosts({ limit: PAGE_SIZE }, { signal }),
  });

  return (
    <Collection
      id="articles"
      title="Articles"
      description="Everything in the bank's journal, in every publish state."
      rowNoun="articles"
      columns={ARTICLE_COLUMNS}
      rows={query.data?.data ?? []}
      rowKey={(row) => row.id}
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => {
        query.refetch();
      }}
    />
  );
}

/** The help centre's questions and answers. */
export function FaqTable() {
  const client = useApiClient();
  const query = useQuery({
    queryKey: opsKeys.content('questions'),
    queryFn: async ({ signal }) => client.admin.cmsFaqs({ limit: PAGE_SIZE }, { signal }),
  });

  return (
    <Collection
      id="questions"
      title="Help centre"
      description="The questions customers ask most, and the answers the bank gives."
      rowNoun="questions"
      columns={FAQ_COLUMNS}
      rows={query.data?.data ?? []}
      rowKey={(row) => row.id}
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => {
        query.refetch();
      }}
    />
  );
}

/** Branches and cash machines. */
export function LocationTable() {
  const client = useApiClient();
  const query = useQuery({
    queryKey: opsKeys.content('branches'),
    queryFn: async ({ signal }) => client.admin.cmsLocations({ limit: PAGE_SIZE }, { signal }),
  });

  return (
    <Collection
      id="branches"
      title="Branches and cash machines"
      description="Addresses, opening hours and accessibility, as shown on the website."
      rowNoun="locations"
      columns={LOCATION_COLUMNS}
      rows={query.data?.data ?? []}
      rowKey={(row) => row.id}
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => {
        query.refetch();
      }}
    />
  );
}
