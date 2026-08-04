/**
 * What is arriving right now.
 *
 * The feed says which transport it is using, because "nothing has arrived for ten
 * minutes" and "the connection died ten minutes ago" look identical on screen and mean
 * completely different things at three in the morning.
 */

'use client';

import type { Transaction } from '@reliance/contracts';
import { MoneyText, StatusPill, Table, type TableColumn } from '@reliance/ui';

import { Panel, QueryState, toneForTransaction } from '@/components/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

import { useLivePostings } from './use-overview';

const COLUMNS: readonly TableColumn<Transaction>[] = [
  {
    id: 'bookedAt',
    header: 'Booked (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.bookedAt)}</span>,
  },
  {
    id: 'description',
    header: 'Narrative',
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{row.description}</span>
        {row.counterparty && (
          <span className="text-fg-muted truncate text-xs">{row.counterparty.name}</span>
        )}
      </span>
    ),
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (row) => (
      <MoneyText amount={row.amount.amount} currency={row.amount.currency} signed size="sm" />
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <StatusPill tone={toneForTransaction(row.status)} label={humaniseCode(row.status)} />
    ),
  },
];

function TransportPill({ streaming }: Readonly<{ streaming: boolean }>) {
  return (
    <StatusPill
      tone={streaming ? 'success' : 'info'}
      live
      label={streaming ? 'Live' : 'Refreshing every 15s'}
    />
  );
}

/** The bank's most recent postings, streamed where the platform allows it. */
export function LivePostings() {
  const feed = useLivePostings();

  if (!feed.allowed) return null;

  return (
    <Panel
      title="Live posting feed"
      description="Every posting written to the ledger, newest first."
      action={<TransportPill streaming={feed.transport === 'stream'} />}
      flush
    >
      <QueryState query={feed} subject="the posting feed">
        <Table
          caption="Recent postings across the bank"
          columns={COLUMNS}
          rows={feed.data?.data ?? []}
          rowKey={(row) => row.id}
        />
      </QueryState>
    </Panel>
  );
}
