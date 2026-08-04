'use client';

/**
 * One movement in a list, as a link.
 *
 * The row itself comes from the design system; what is added here is that it *is* an anchor. A
 * transaction is a thing a customer bookmarks, forwards to a partner and pastes into a message to
 * support, and a button that pushes a route can do none of those. `TransactionRow` renders a
 * plain element when it is given no `onSelect`, so there is no control nested inside the link.
 */

import Link from 'next/link';
import { useMemo } from 'react';

import { TransactionStatus, type Transaction } from '@reliance/contracts';
import { cn, FOCUS_RING_INSET, TransactionRow, TRANSITION_STATE } from '@reliance/ui';

import { formatDateTime } from '@/lib/format';

import { signedAmount } from './amounts';
import { CATEGORY_LABEL, ENTRY_TYPE_LABEL, ROW_STATUS_TONE, STATUS_LABEL } from './labels';
import { transactionRoute } from './routes';

/** Props for {@link TransactionLink}. */
export interface TransactionLinkProps {
  readonly transaction: Transaction;
  /** Adds the balance after the movement, as a statement view does. */
  readonly withBalance?: boolean;
  /** Replaces the category line — used where the list is already scoped to one category. */
  readonly detail?: string;
}

/** Statuses that are worth a pill. A completed payment from March is not news. */
function statusFor(transaction: Transaction) {
  if (transaction.status === TransactionStatus.COMPLETED) return undefined;
  return { label: STATUS_LABEL[transaction.status], tone: ROW_STATUS_TONE[transaction.status] };
}

/**
 * @example <TransactionLink transaction={transaction} withBalance />
 */
export function TransactionLink({ transaction, withBalance, detail }: TransactionLinkProps) {
  const line = useMemo(
    () =>
      detail ?? `${CATEGORY_LABEL[transaction.category]} · ${ENTRY_TYPE_LABEL[transaction.type]}`,
    [detail, transaction.category, transaction.type],
  );

  const status = statusFor(transaction);
  const pending = transaction.status === TransactionStatus.PENDING;

  return (
    <Link
      href={transactionRoute(transaction.id)}
      className={cn('hover:bg-surface-sunken block rounded-md', FOCUS_RING_INSET, TRANSITION_STATE)}
    >
      <TransactionRow
        counterparty={transaction.counterparty?.name ?? transaction.description}
        amount={signedAmount(transaction)}
        currency={transaction.amount.currency}
        when={formatDateTime(transaction.bookedAt)}
        detail={line}
        pending={pending}
        {...(status ? { status } : {})}
        {...(withBalance && !status ? { balanceAfter: transaction.runningBalance.amount } : {})}
      />
    </Link>
  );
}
