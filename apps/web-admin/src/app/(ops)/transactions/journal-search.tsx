/**
 * The journal, searched directly.
 *
 * The posting search answers "what happened to this customer". This answers "what did the
 * bank write", which is a different question and the one Financial Control asks. Both
 * sides of every entry are one click away, and the debit and credit totals are on the row
 * so an unbalanced entry would be visible without opening anything.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { EntryType, type JournalEntry } from '@reliance/contracts';
import { Button, MoneyText, StatusPill } from '@reliance/ui';

import { entryBalance, JournalEntryView } from '@/components/finance';
import { Panel, QueryState, opsKeys, toneForEntry } from '@/components/ops';
import {
  DataTable,
  DetailDrawer,
  FilterBar,
  type DataColumn,
  type FilterSpec,
} from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatDate, formatInstant, humaniseCode } from '@/lib/format';

import { DAY_END, DAY_START } from './posting-filters';

/** Entries read per page. */
const PAGE_SIZE = 50;

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'type',
    label: 'Entry type',
    kind: 'select',
    options: Object.values(EntryType).map((value) => ({ value, label: humaniseCode(value) })),
  },
  { id: 'accountId', label: 'Account', kind: 'text', placeholder: 'acc_…' },
  { id: 'from', label: 'Value date from', kind: 'date' },
  { id: 'to', label: 'Value date to', kind: 'date' },
];

function sideAmount(entry: JournalEntry, side: 'debits' | 'credits') {
  const balance = entryBalance(entry.postings);
  const currency = balance.currency ?? 'GBP';
  return <MoneyText amount={balance[side]} currency={currency} display="none" size="sm" muted />;
}

/** What the entry is and when it happened. */
const IDENTITY_COLUMNS: readonly DataColumn<JournalEntry>[] = [
  {
    id: 'reference',
    header: 'Reference',
    alwaysVisible: true,
    cell: (row) => <span className="font-mono text-xs">{row.reference}</span>,
    csv: (row) => row.reference,
  },
  {
    id: 'description',
    header: 'Description',
    alwaysVisible: true,
    cell: (row) => row.description,
    csv: (row) => row.description,
  },
  { id: 'type', header: 'Type', cell: (row) => humaniseCode(row.type), csv: (row) => row.type },
  {
    id: 'valueDate',
    header: 'Value date',
    cell: (row) => formatDate(row.valueDate),
    csv: (row) => row.valueDate,
    sortValue: (row) => row.valueDate,
  },
  {
    id: 'bookedAt',
    header: 'Booked (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.bookedAt)}</span>,
    csv: (row) => row.bookedAt,
    sortValue: (row) => row.bookedAt,
  },
];

/** The two sides, totalled on the row so an unbalanced entry is visible unopened. */
const FIGURE_COLUMNS: readonly DataColumn<JournalEntry>[] = [
  {
    id: 'debits',
    header: 'Debits',
    align: 'end',
    cell: (row) => sideAmount(row, 'debits'),
    csv: (row) => entryBalance(row.postings).debits,
    sortValue: (row) => BigInt(entryBalance(row.postings).debits),
  },
  {
    id: 'credits',
    header: 'Credits',
    align: 'end',
    cell: (row) => sideAmount(row, 'credits'),
    csv: (row) => entryBalance(row.postings).credits,
    sortValue: (row) => BigInt(entryBalance(row.postings).credits),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusPill tone={toneForEntry(row.status)} label={humaniseCode(row.status)} />,
    csv: (row) => row.status,
  },
];

function columns(onInspect: (entry: JournalEntry) => void): readonly DataColumn<JournalEntry>[] {
  return [
    ...IDENTITY_COLUMNS,
    ...FIGURE_COLUMNS,
    {
      id: 'inspect',
      header: 'Postings',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onInspect(row)}>
          Both sides
        </Button>
      ),
      csv: (row) => String(row.postings.length),
    },
  ];
}

function toQuery(values: Readonly<Record<string, string>>) {
  return {
    limit: PAGE_SIZE,
    ...(values.type ? { type: values.type as EntryType } : {}),
    ...(values.accountId?.trim() ? { accountId: values.accountId.trim() } : {}),
    ...(values.from ? { from: `${values.from}${DAY_START}` } : {}),
    ...(values.to ? { to: `${values.to}${DAY_END}` } : {}),
  };
}

/** The journal, with the entry inspector behind it. */
/** Both sides of one entry, which is the only view where a posting can be checked. */
function EntryDrawer({
  entry,
  onClose,
}: {
  readonly entry: JournalEntry | null;
  readonly onClose: () => void;
}) {
  return (
    <DetailDrawer
      open={entry !== null}
      onClose={onClose}
      title="Journal entry"
      recordId={entry?.id}
    >
      {entry && <JournalEntryView entry={entry} />}
    </DetailDrawer>
  );
}

export function JournalSearch() {
  const client = useApiClient();
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [inspecting, setInspecting] = useState<JournalEntry | null>(null);

  const query = useQuery({
    queryKey: opsKeys.journal(filters),
    queryFn: async ({ signal }) => client.admin.journalEntries(toQuery(filters), { signal }),
  });

  return (
    <Panel
      title="Journal"
      description="The ledger's own record: every entry, and both sides of each one."
      flush
    >
      <QueryState query={query} subject="the journal">
        <DataTable
          tableId="ops-journal"
          caption="Journal entries, filtered"
          rowNoun="entries"
          columns={columns(setInspecting)}
          rows={query.data?.data ?? []}
          rowKey={(row) => row.id}
          totalCount={query.data?.page.total}
          defaultSort={{ columnId: 'bookedAt', direction: 'desc' }}
          filterValues={filters}
          onFilterValuesChange={setFilters}
          exportName="journal-entries"
          filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
        />
      </QueryState>

      <EntryDrawer entry={inspecting} onClose={() => setInspecting(null)} />
    </Panel>
  );
}
