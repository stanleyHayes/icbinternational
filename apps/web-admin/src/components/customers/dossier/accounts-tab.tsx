/**
 * What the customer holds, and what they can actually spend.
 *
 * Three balances are shown per account rather than one, because they answer different
 * questions and staff conflate them constantly. Ledger is what has been booked; available
 * is ledger minus holds plus any overdraft headroom, and it is the figure a customer
 * ringing in about a declined payment is really asking about; held is the difference, and
 * it is listed underneath with the reason for each lien so the gap is explained rather
 * than merely stated.
 */

'use client';

import type { Account, Hold } from '@reliance/contracts';
import { EmptyState, MoneyText, StatusPill } from '@reliance/ui';

import { QueueError, QueueLoading, ScreenPanel } from '@/components/compliance/kit';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { formatBasisPoints, formatInstant, humaniseCode } from '@/lib/format';

import { useCustomerAccounts, useCustomerHolds } from '../data/use-dossier';

const ACCOUNT_TONE = {
  ACTIVE: 'success',
  FROZEN: 'danger',
  CLOSED: 'neutral',
  CLOSING: 'warning',
  DORMANT: 'warning',
  PENDING: 'pending',
} as const;

const ACCOUNT_COLUMNS: readonly DataColumn<Account>[] = [
  {
    id: 'account',
    header: 'Account',
    alwaysVisible: true,
    cell: (account) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm font-medium">
          {account.nickname ?? account.productName}
        </span>
        <span className="text-fg-muted font-mono text-xs">
          {account.sortCode} · {account.number}
        </span>
      </span>
    ),
    csv: (account) => `${account.nickname ?? account.productName} ${account.number}`,
  },
  {
    id: 'type',
    header: 'Product',
    cell: (account) => (
      <span className="font-body text-fg-muted text-sm">{humaniseCode(account.type)}</span>
    ),
    csv: (account) => humaniseCode(account.type),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (account) => (
      <StatusPill tone={ACCOUNT_TONE[account.status]} label={humaniseCode(account.status)} />
    ),
    csv: (account) => humaniseCode(account.status),
  },
  {
    id: 'ledger',
    header: 'Booked',
    align: 'end',
    cell: (account) => (
      <MoneyText amount={account.balance.ledger.amount} currency={account.currency} muted />
    ),
    csv: (account) => account.balance.ledger.amount,
    sortValue: (account) => BigInt(account.balance.ledger.amount),
  },
  {
    id: 'held',
    header: 'On hold',
    align: 'end',
    cell: (account) => (
      <MoneyText amount={account.balance.held.amount} currency={account.currency} muted />
    ),
    csv: (account) => account.balance.held.amount,
    sortValue: (account) => BigInt(account.balance.held.amount),
  },
  {
    id: 'available',
    header: 'Available',
    align: 'end',
    cell: (account) => (
      <MoneyText
        amount={account.balance.available.amount}
        currency={account.currency}
        srLabel="Available balance"
      />
    ),
    csv: (account) => account.balance.available.amount,
    sortValue: (account) => BigInt(account.balance.available.amount),
  },
  {
    id: 'rate',
    header: 'Rate',
    cell: (account) => (
      <span className="text-fg-muted font-mono text-xs">
        {account.interestRateBps === null ? 'None' : formatBasisPoints(account.interestRateBps)}
      </span>
    ),
    csv: (account) =>
      account.interestRateBps === null ? 'None' : formatBasisPoints(account.interestRateBps),
  },
  {
    id: 'iban',
    header: 'IBAN',
    cell: (account) => <span className="text-fg-subtle font-mono text-xs">{account.iban}</span>,
    csv: (account) => account.iban,
  },
];

const HOLD_COLUMNS: readonly DataColumn<Hold>[] = [
  {
    id: 'reason',
    header: 'Reason',
    alwaysVisible: true,
    cell: (hold) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm">{humaniseCode(hold.reason)}</span>
        <span className="font-body text-fg-muted text-xs">{hold.description}</span>
      </span>
    ),
    csv: (hold) => `${humaniseCode(hold.reason)}: ${hold.description}`,
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (hold) => <MoneyText amount={hold.amount.amount} currency={hold.amount.currency} />,
    csv: (hold) => hold.amount.amount,
    sortValue: (hold) => BigInt(hold.amount.amount),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (hold) => <span className="font-body text-sm">{humaniseCode(hold.status)}</span>,
    csv: (hold) => humaniseCode(hold.status),
  },
  {
    id: 'placed',
    header: 'Placed',
    cell: (hold) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(hold.placedAt)}</span>
    ),
    csv: (hold) => formatInstant(hold.placedAt),
    sortValue: (hold) => hold.placedAt,
  },
  {
    id: 'expires',
    header: 'Expires',
    cell: (hold) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(hold.expiresAt)}</span>
    ),
    csv: (hold) => formatInstant(hold.expiresAt),
  },
];

export interface AccountsTabProps {
  readonly customerId: string;
  readonly accountIds: readonly string[];
}

function HoldsPanel({ customerId, accountIds }: AccountsTabProps) {
  const holds = useCustomerHolds(customerId, accountIds);

  return (
    <ScreenPanel title="Holds and liens" flush>
      {holds.isPending && <QueueLoading label="holds" />}
      {holds.isError && (
        <QueueError error={holds.error} subject="this customer's holds" onRetry={holds.refetch} />
      )}
      {holds.data && (
        <DataTable
          tableId="customer-holds"
          caption="Holds against this customer's accounts"
          rowNoun="holds"
          columns={HOLD_COLUMNS}
          rows={holds.data}
          rowKey={(hold) => hold.id}
          exportName="customer-holds"
          defaultSort={{ columnId: 'placed', direction: 'desc' }}
          empty={
            <EmptyState
              title="Nothing is held"
              description="Every penny booked to these accounts is available to spend."
            />
          }
        />
      )}
    </ScreenPanel>
  );
}

/** Accounts, balances and the liens reducing them. */
export function AccountsTab({ customerId, accountIds }: AccountsTabProps) {
  const accounts = useCustomerAccounts(customerId);

  return (
    <div className="flex flex-col gap-4">
      <ScreenPanel title="Accounts" flush>
        {accounts.isPending && <QueueLoading label="accounts" />}
        {accounts.isError && (
          <QueueError
            error={accounts.error}
            subject="this customer's accounts"
            onRetry={accounts.refetch}
          />
        )}
        {accounts.data && (
          <DataTable
            tableId="customer-accounts"
            caption="Accounts held by this customer"
            rowNoun="accounts"
            columns={ACCOUNT_COLUMNS}
            rows={accounts.data}
            rowKey={(account) => account.id}
            exportName="customer-accounts"
            empty={
              <EmptyState
                title="No accounts on this record"
                description="This customer has completed registration but has not opened an account yet."
              />
            }
          />
        )}
      </ScreenPanel>

      {accountIds.length > 0 && <HoldsPanel customerId={customerId} accountIds={accountIds} />}
    </div>
  );
}
