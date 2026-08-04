'use client';

/**
 * What has been spent on this card.
 *
 * Card transactions are shown here rather than only in the account feed because "which card was
 * that on?" is a real question when a household has four of them, and because a declined
 * authorisation never becomes a transaction at all — the two lists answer different questions.
 */

import { useQuery } from '@tanstack/react-query';

import { TransactionDirection, TransactionStatus, type Transaction } from '@reliance/contracts';
import { TransactionRow } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import { movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 10;

const NOTHING_SPENT = (
  <EmptyPanel
    title="Nothing spent on this card yet"
    description="Payments made with this card will appear here, newest first, with the merchant and the amount."
  />
);

/** Props for {@link CardTransactions}. */
export interface CardTransactionsProps {
  readonly cardId: string;
}

/**
 * One purchase.
 *
 * The contract stores a magnitude and a direction; `MoneyText` colours by sign. So the sign is
 * applied here, once, rather than left to each row to remember — a debit rendered without its
 * minus is a debit that reads as money coming in.
 */
function Row({ transaction }: { readonly transaction: Transaction }) {
  const debit = transaction.direction === TransactionDirection.DEBIT;
  const signed = debit ? `-${transaction.amount.amount}` : transaction.amount.amount;

  return (
    <li>
      <TransactionRow
        counterparty={transaction.counterparty?.name ?? transaction.description}
        detail={transaction.description}
        amount={signed}
        currency={transaction.amount.currency}
        when={formatDateTime(transaction.bookedAt)}
        pending={transaction.status === TransactionStatus.PENDING}
      />
    </li>
  );
}

/**
 * @example <CardTransactions cardId={card.id} />
 */
export function CardTransactions({ cardId }: CardTransactionsProps) {
  const transactions = useQuery({
    queryKey: movementKeys.cards.transactions(cardId),
    queryFn: async () => (await browserApi().cards.transactions(cardId, { limit: PAGE_SIZE })).data,
  });

  return (
    <Section title="Spending on this card" description="The most recent payments, newest first.">
      <QueryPanel
        query={transactions}
        skeletonRows={3}
        isEmpty={(list) => list.length === 0}
        empty={NOTHING_SPENT}
      >
        {(list) => (
          <ul className="divide-border flex flex-col divide-y">
            {list.map((transaction) => (
              <Row key={transaction.id} transaction={transaction} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
