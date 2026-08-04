/**
 * Everything that has moved across this customer's accounts.
 *
 * The sign convention is the customer's, not the bank's. A `CREDIT` on the customer's
 * account increases what they hold — it is a liability of ours going up — and it renders
 * green with a leading plus; a `DEBIT` reduces it and renders in the debit colour with a
 * minus. Getting this backwards is the classic sign error in a banking console, so the
 * direction is also written in words in its own column and the money component is handed
 * a signed amount rather than being asked to infer anything.
 */

'use client';

import { TransactionDirection, type Transaction } from '@reliance/contracts';
import { Badge, EmptyState, MoneyText, StatusPill } from '@reliance/ui';

import { QueueError, QueueLoading, ScreenPanel } from '@/components/compliance/kit';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

import { useCustomerPostings } from '../data/use-dossier';

const STATUS_TONE = {
  COMPLETED: 'success',
  PENDING: 'pending',
  FAILED: 'danger',
  REVERSED: 'neutral',
  DISPUTED: 'warning',
} as const;

/**
 * The amount as the customer experiences it.
 *
 * The contract stores every amount positive and carries the sign in `direction`, so the
 * sign is reapplied here — once, in one place — rather than at each call site.
 */
function signedAmount(posting: Transaction): string {
  return posting.direction === TransactionDirection.DEBIT
    ? `-${posting.amount.amount}`
    : posting.amount.amount;
}

const POSTING_COLUMNS: readonly DataColumn<Transaction>[] = [
  {
    id: 'bookedAt',
    header: 'Booked',
    alwaysVisible: true,
    cell: (posting) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(posting.bookedAt)}</span>
    ),
    csv: (posting) => formatInstant(posting.bookedAt),
    sortValue: (posting) => posting.bookedAt,
  },
  {
    id: 'description',
    header: 'Description',
    alwaysVisible: true,
    cell: (posting) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm">{posting.description}</span>
        {posting.counterparty && (
          <span className="font-body text-fg-muted text-xs">{posting.counterparty.name}</span>
        )}
      </span>
    ),
    csv: (posting) => posting.description,
  },
  {
    id: 'direction',
    header: 'Direction',
    cell: (posting) => (
      <span className="font-body text-fg-muted text-sm">{humaniseCode(posting.direction)}</span>
    ),
    csv: (posting) => humaniseCode(posting.direction),
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (posting) => (
      <MoneyText
        amount={signedAmount(posting)}
        currency={posting.amount.currency}
        signed
        pending={posting.status === 'PENDING'}
      />
    ),
    csv: (posting) => signedAmount(posting),
    sortValue: (posting) => BigInt(signedAmount(posting)),
  },
  {
    id: 'balance',
    header: 'Balance after',
    align: 'end',
    cell: (posting) => (
      <MoneyText
        amount={posting.runningBalance.amount}
        currency={posting.runningBalance.currency}
        muted
      />
    ),
    csv: (posting) => posting.runningBalance.amount,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (posting) => (
      <StatusPill tone={STATUS_TONE[posting.status]} label={humaniseCode(posting.status)} />
    ),
    csv: (posting) => humaniseCode(posting.status),
  },
  {
    id: 'type',
    header: 'Type',
    cell: (posting) => <Badge>{humaniseCode(posting.type)}</Badge>,
    csv: (posting) => humaniseCode(posting.type),
  },
  {
    id: 'reference',
    header: 'Reference',
    cell: (posting) => (
      <span className="text-fg-subtle font-mono text-xs">{posting.reference ?? 'None'}</span>
    ),
    csv: (posting) => posting.reference ?? '',
  },
  {
    id: 'entry',
    header: 'Journal entry',
    cell: (posting) => (
      <span className="text-fg-subtle font-mono text-xs">{posting.journalEntryId}</span>
    ),
    csv: (posting) => posting.journalEntryId,
  },
];

export interface ActivityTabProps {
  readonly customerId: string;
  readonly accountIds: readonly string[];
}

/** Postings across every account the customer holds. */
export function ActivityTab({ customerId, accountIds }: ActivityTabProps) {
  const postings = useCustomerPostings(customerId, accountIds);

  return (
    <ScreenPanel title="Account activity" flush>
      {postings.isLoading && <QueueLoading label="postings" />}
      {postings.isError && (
        <QueueError
          error={postings.error}
          subject="this customer's activity"
          onRetry={postings.refetch}
        />
      )}
      {!postings.isLoading && !postings.isError && (
        <DataTable
          tableId="customer-postings"
          caption="Postings across this customer's accounts"
          rowNoun="postings"
          columns={POSTING_COLUMNS}
          rows={postings.data ?? []}
          rowKey={(posting) => posting.id}
          exportName="customer-activity"
          defaultSort={{ columnId: 'bookedAt', direction: 'desc' }}
          empty={
            <EmptyState
              title="Nothing has been booked yet"
              description="No money has moved across this customer's accounts."
            />
          }
        />
      )}
    </ScreenPanel>
  );
}
