'use client';

/**
 * Fetches one movement and hands it to the detail view.
 *
 * Split from the page so the page stays a server component that can guard the session, while the
 * record itself is read in the browser through the shared client — which is also what keeps it in
 * the same cache as the list the customer arrived from, so going back is instant.
 */

import { EmptyPanel, LinkButton, RouteLoading } from '@/components/shell';
import { transactionsRoute } from '@/components/transactions/routes';
import { TransactionDetail } from '@/components/transactions/transaction-detail';
import { useTransaction } from '@/components/transactions/use-transactions';
import { describeError } from '@/lib/errors';

/** Props for {@link MovementScreen}. */
export interface MovementScreenProps {
  readonly transactionId: string;
}

/** One movement, or an honest account of why it is not on screen. */
export function MovementScreen({ transactionId }: MovementScreenProps) {
  const transaction = useTransaction(transactionId);

  if (transaction.isPending) return <RouteLoading rows={4} withHeader={false} />;

  if (transaction.isError) {
    const described = describeError(transaction.error);
    return (
      <EmptyPanel
        title={described.title}
        description={`${described.message} Nothing about this payment has changed.`}
        action={<LinkButton href={transactionsRoute()}>Back to your activity</LinkButton>}
      />
    );
  }

  return <TransactionDetail transaction={transaction.data} />;
}
