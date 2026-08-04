'use client';

/**
 * The three states every list on a screen has, in one place.
 *
 * A query is loading, or it failed, or it came back empty, or it has data. Written inline at each
 * call site that becomes four branches per list and, in practice, a missing error branch on the
 * third one — a customer staring at a spinner that will never stop because the request 403'd.
 *
 * Failure copy comes from `describeError`, so a contract code never reaches the screen, and the
 * retry button is offered only where trying again unchanged is honest.
 */

import type { UseQueryResult } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, Button, Skeleton } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import { describeError } from '@/lib/errors';

const DEFAULT_SKELETON_ROWS = 3;

/** Props for {@link QueryPanel}. */
export interface QueryPanelProps<T> {
  /** The query being rendered. */
  readonly query: UseQueryResult<T>;
  /** True when the resolved data has nothing in it. */
  readonly isEmpty?: (data: T) => boolean;
  /** What to show instead of the content when the result is empty. */
  readonly empty?: ReactElement;
  /** How many placeholder rows to sketch while it loads. */
  readonly skeletonRows?: number;
  /** Rendered once there is data. */
  readonly children: (data: T) => ReactElement;
}

function LoadingRows({ rows }: { readonly rows: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_unused, index) => `placeholder-${index}`).map((key) => (
        <div key={key} className="border-border flex items-center gap-4 rounded-md border p-4">
          <Skeleton shape="circle" className="size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-2 h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** The failure state, in the bank's voice, with the one honest recovery offered. */
function FailurePanel({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const described = describeError(error);

  return (
    <Alert tone="danger" title={described.title}>
      <p>{described.message}</p>
      {described.reference ? (
        <p className="text-fg-subtle mt-2 font-mono text-xs">Reference {described.reference}</p>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        onClick={onRetry}
        startIcon={<RefreshCw aria-hidden="true" className="size-4" />}
      >
        Try again
      </Button>
    </Alert>
  );
}

/**
 * @example
 * <QueryPanel query={payees} isEmpty={(list) => list.length === 0} empty={<EmptyPanel … />}>
 *   {(list) => <PayeeTable rows={list} />}
 * </QueryPanel>
 */
export function QueryPanel<T>({
  query,
  isEmpty,
  empty,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  children,
}: QueryPanelProps<T>): ReactElement {
  if (query.isPending) return <LoadingRows rows={skeletonRows} />;

  if (query.isError) {
    return <FailurePanel error={query.error} onRetry={() => void query.refetch()} />;
  }

  if (isEmpty?.(query.data)) return empty ?? <NothingYet />;

  return children(query.data);
}

/** The default empty state, for a list whose screen has not written a better one. */
function NothingYet() {
  return (
    <EmptyPanel
      title="Nothing here yet"
      description="Once there is something to show, it will appear here."
    />
  );
}
