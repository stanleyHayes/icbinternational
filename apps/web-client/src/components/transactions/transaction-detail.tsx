'use client';

/**
 * Everything the bank knows about one movement.
 *
 * The headline is the amount, signed, because that is the question the customer opened the screen
 * to answer. Underneath it the facts are ordered the way a dispute is investigated: who, when,
 * how, under what reference, and against which balance.
 *
 * A cross-currency movement shows the original amount and the rate applied. Showing only the
 * sterling figure invites the customer to conclude they were charged the wrong amount abroad.
 */

import Link from 'next/link';

import { TransactionStatus, type Transaction } from '@reliance/contracts';
import { Card, CardHeader, cn, MoneyText, StatusPill, TEXT_STYLE } from '@reliance/ui';

import { accountRoute } from '@/components/accounts/routes';
import { formatDate, formatDateTime } from '@/lib/format';

import { signedAmount } from './amounts';
import { DefinitionList, type DefinitionRow } from './definition-list';
import {
  CATEGORY_LABEL,
  DIRECTION_LABEL,
  ENTRY_TYPE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from './labels';
import { ReceiptPanel } from './receipt-panel';
import { TransactionNotes } from './transaction-notes';

function conversionRows(transaction: Transaction): readonly DefinitionRow[] {
  const { originalAmount, exchangeRate } = transaction;
  if (!originalAmount) return [];

  return [
    {
      label: 'Original amount',
      value: <MoneyText amount={originalAmount.amount} currency={originalAmount.currency} muted />,
      hint: 'The amount before we converted it',
    },
    { label: 'Exchange rate', value: exchangeRate },
  ];
}

function detailRows(transaction: Transaction): readonly DefinitionRow[] {
  return [
    { label: 'Direction', value: DIRECTION_LABEL[transaction.direction] },
    { label: 'Payment type', value: ENTRY_TYPE_LABEL[transaction.type] },
    { label: 'Category', value: CATEGORY_LABEL[transaction.category] },
    { label: 'Booked', value: formatDateTime(transaction.bookedAt) },
    {
      label: 'Cleared',
      value: transaction.completedAt ? formatDate(transaction.completedAt) : 'Not cleared yet',
    },
    { label: 'Reference', value: transaction.reference },
    ...conversionRows(transaction),
    {
      label: 'Balance afterwards',
      value: (
        <MoneyText
          amount={transaction.runningBalance.amount}
          currency={transaction.runningBalance.currency}
          muted
        />
      ),
      hint: 'The balance on this account immediately after this movement',
    },
    {
      label: 'Account',
      value: (
        <Link
          href={accountRoute(transaction.accountId)}
          className="text-accent underline underline-offset-2"
        >
          Open the account this was on
        </Link>
      ),
    },
  ];
}

function Headline({ transaction }: { readonly transaction: Transaction }) {
  const pending = transaction.status === TransactionStatus.PENDING;

  return (
    <Card elevation="raised" className="flex flex-col gap-2">
      <p className={cn(TEXT_STYLE.caption)}>
        {transaction.counterparty?.name ?? transaction.description}
      </p>
      <MoneyText
        amount={signedAmount(transaction)}
        currency={transaction.amount.currency}
        size="display"
        signed
        pending={pending}
        srLabel={DIRECTION_LABEL[transaction.direction]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill
          tone={STATUS_TONE[transaction.status]}
          label={STATUS_LABEL[transaction.status]}
          live={pending}
        />
        {transaction.disputeId ? (
          <span className="text-fg-muted text-sm">We are investigating this payment with you.</span>
        ) : null}
      </div>
    </Card>
  );
}

/** Props for {@link TransactionDetail}. */
export interface TransactionDetailProps {
  readonly transaction: Transaction;
}

/**
 * @example <TransactionDetail transaction={transaction} />
 */
export function TransactionDetail({ transaction }: TransactionDetailProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <Headline transaction={transaction} />
        <Card>
          <CardHeader title="Details" />
          <DefinitionList className="mt-2" rows={detailRows(transaction)} />
        </Card>
        <ReceiptPanel transaction={transaction} />
      </div>
      <div className="flex flex-col gap-6 print:hidden">
        <TransactionNotes transaction={transaction} />
      </div>
    </div>
  );
}
