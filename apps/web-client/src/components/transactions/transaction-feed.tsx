'use client';

/**
 * The scrolling list of movements.
 *
 * Rows arrive a page at a time and the space for the next page is reserved before it lands, so
 * the list grows downwards and nothing already on screen moves. On a statement that is not a
 * nicety: a row that shifts under a thumb is a customer opening the wrong payment.
 *
 * Two empty states, because they need two different remedies. An account with no history is told
 * what will appear here; a filter that matched nothing is offered a way back to everything.
 */

import { ArrowDown } from 'lucide-react';

import type { Transaction } from '@reliance/contracts';
import { Button, Skeleton } from '@reliance/ui';

import { EmptyPanel, NoResultsPanel } from '@/components/shell';
import { describeError } from '@/lib/errors';

import { isUnfiltered, type TransactionFilters } from './filters';
import { TransactionLink } from './transaction-link';
import { useInfiniteSentinel } from './use-infinite-sentinel';
import { useTransactionFeed } from './use-transactions';

/** Skeleton rows drawn while the first page is on its way. */
const PLACEHOLDER_ROWS = 8;

/** Rows sketched under the list while the next page loads, so the scrollbar does not jump. */
const NEXT_PAGE_PLACEHOLDER_ROWS = 5;

function PlaceholderRows({ count }: { readonly count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_unused, index) => `placeholder-${index}`).map((key) => (
        <li key={key} className="flex h-[68px] items-center gap-3 px-4">
          <Skeleton shape="circle" className="size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-2 h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-20 shrink-0" />
        </li>
      ))}
    </>
  );
}

function FeedFailure({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const described = describeError(error);

  return (
    <EmptyPanel
      title={described.title}
      description={described.message}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

function FeedEmpty({
  filters,
  onClearFilters,
}: {
  readonly filters: TransactionFilters;
  readonly onClearFilters?: () => void;
}) {
  if (isUnfiltered(filters)) {
    return (
      <EmptyPanel
        title="No activity yet"
        description="Payments in and out will appear here as soon as the first one is booked, with the balance after each one."
      />
    );
  }

  return (
    <NoResultsPanel
      query={filters.search || undefined}
      action={
        onClearFilters ? (
          <Button variant="secondary" onClick={onClearFilters}>
            Clear the filters
          </Button>
        ) : undefined
      }
    />
  );
}

interface FooterProps {
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onLoadMore: () => void;
  readonly exhausted: boolean;
}

function FeedFooter({ hasMore, loading, onLoadMore, exhausted }: FooterProps) {
  if (hasMore) {
    return (
      <Button
        variant="secondary"
        onClick={onLoadMore}
        loading={loading}
        startIcon={<ArrowDown aria-hidden="true" className="size-4" />}
      >
        {loading ? 'Loading more activity' : 'Show more activity'}
      </Button>
    );
  }

  if (!exhausted) return null;

  return (
    <p aria-live="polite" className="text-fg-muted text-sm">
      That is the end of this activity.
    </p>
  );
}

/** Props for {@link TransactionFeed}. */
export interface TransactionFeedProps {
  readonly filters: TransactionFilters;
  /** Offered when the list is empty because the filters matched nothing. */
  readonly onClearFilters?: () => void;
  /** Adds the running balance to each row, as a statement does. */
  readonly withBalance?: boolean;
}

/**
 * @example <TransactionFeed filters={filters} onClearFilters={clearFilters} />
 */
export function TransactionFeed({ filters, onClearFilters, withBalance }: TransactionFeedProps) {
  const feed = useTransactionFeed(filters);
  const rows: readonly Transaction[] = feed.data?.pages.flatMap((page) => page.data) ?? [];

  const loadMore = (): void => {
    feed.fetchNextPage();
  };
  const retry = (): void => {
    feed.refetch();
  };

  const canLoadMore = Boolean(feed.hasNextPage) && !feed.isFetchingNextPage;
  const sentinel = useInfiniteSentinel(canLoadMore, loadMore);

  if (feed.isError) return <FeedFailure error={feed.error} onRetry={retry} />;
  if (!feed.isPending && rows.length === 0) {
    return <FeedEmpty filters={filters} onClearFilters={onClearFilters} />;
  }

  return (
    <div className="border-border bg-surface rounded-lg border">
      <ul aria-busy={feed.isPending} className="divide-border divide-y">
        {rows.map((transaction) => (
          <li key={transaction.id}>
            <TransactionLink transaction={transaction} withBalance={withBalance} />
          </li>
        ))}
        {feed.isPending ? <PlaceholderRows count={PLACEHOLDER_ROWS} /> : null}
        {feed.isFetchingNextPage ? <PlaceholderRows count={NEXT_PAGE_PLACEHOLDER_ROWS} /> : null}
      </ul>

      <div ref={sentinel} className="flex items-center justify-center p-4">
        <FeedFooter
          hasMore={Boolean(feed.hasNextPage)}
          loading={feed.isFetchingNextPage}
          onLoadMore={loadMore}
          exhausted={rows.length > 0}
        />
      </div>
    </div>
  );
}
