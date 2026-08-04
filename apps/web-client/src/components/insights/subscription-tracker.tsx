'use client';

/**
 * Recurring payments the categoriser has spotted.
 *
 * Sorted by what is due next rather than by size, because the useful question is "what is about
 * to leave my account", not "what is my biggest subscription". Each row states the cadence in
 * words and the date of the next expected charge, and links to the payments it was inferred from
 * so the customer can check we have not mistaken three coincidental payments for a subscription.
 *
 * The monthly-equivalent total at the bottom is the honest version of "you spend £X a month on
 * subscriptions": annual and quarterly charges are apportioned rather than counted whole, and the
 * apportionment is done in `bigint` with the remainder kept.
 */

import Link from 'next/link';

import type { Subscription } from '@reliance/contracts';
import { Alert, MoneyText, Skeleton, cn, TEXT_STYLE } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import type { TransactionFilters } from '@/components/transactions/filters';
import { transactionsRoute } from '@/components/transactions/routes';
import { describeError } from '@/lib/errors';
import { formatDate } from '@/lib/format';

import { monthlyEquivalent, CADENCE_LABEL } from './subscriptions';
import { useSubscriptions } from './use-insights';

function Row({
  subscription,
  filters,
}: {
  readonly subscription: Subscription;
  readonly filters: TransactionFilters;
}) {
  const { amount, merchantName, cadence, nextExpectedAt } = subscription;

  return (
    <li className="border-border flex items-start justify-between gap-4 border-b py-3 last:border-0">
      <div className="min-w-0">
        <Link
          href={transactionsRoute({ ...filters, search: merchantName })}
          className="text-fg hover:text-accent font-medium underline underline-offset-2"
        >
          {merchantName}
        </Link>
        <p className="text-fg-muted text-sm">
          {`${CADENCE_LABEL[cadence]} · next expected ${formatDate(nextExpectedAt)}`}
        </p>
      </div>
      <MoneyText amount={amount.amount} currency={amount.currency} muted />
    </li>
  );
}

/** Props for {@link SubscriptionTracker}. */
export interface SubscriptionTrackerProps {
  /** The window the "see the payments" links carry. */
  readonly filters: TransactionFilters;
}

/**
 * @example <SubscriptionTracker filters={filters} />
 */
export function SubscriptionTracker({ filters }: SubscriptionTrackerProps) {
  const subscriptions = useSubscriptions();

  if (subscriptions.isPending) return <Skeleton className="h-48 w-full" />;

  if (subscriptions.isError) {
    return (
      <Alert tone="warning" title="We could not load your recurring payments">
        {describeError(subscriptions.error).message}
      </Alert>
    );
  }

  if (subscriptions.data.length === 0) {
    return (
      <EmptyPanel
        bordered={false}
        title="No recurring payments spotted"
        description="When the same merchant charges you on a regular pattern, we will list it here with the date the next one is due."
      />
    );
  }

  const ordered = [...subscriptions.data].sort((left, right) =>
    left.nextExpectedAt.localeCompare(right.nextExpectedAt),
  );
  const monthly = monthlyEquivalent(ordered);

  return (
    <>
      <ul>
        {ordered.map((subscription) => (
          <Row key={subscription.merchantName} subscription={subscription} filters={filters} />
        ))}
      </ul>
      <p className={cn(TEXT_STYLE.caption, 'mt-3 flex flex-wrap items-center gap-1')}>
        <span>That is about</span>
        <MoneyText amount={monthly.amount} currency={monthly.currency} size="sm" muted />
        <span>a month, with annual and quarterly charges spread across the year.</span>
      </p>
    </>
  );
}
