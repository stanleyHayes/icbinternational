/**
 * What a screen shows while it is waiting, and what it shows when the platform refuses.
 *
 * Written once because the wrong version of this is what makes a console feel unreliable:
 * a spinner with no bound, or a red box containing a status code. Every failure here says
 * what happened in the bank's own words, offers the trace id separately for an incident
 * ticket, and gives the operator a way to try again without losing the screen.
 */

'use client';

import type { ReactNode } from 'react';

import { Button, ErrorState, Skeleton } from '@reliance/ui';

import { messageFor, traceIdFor } from '@/lib/errors';

/** Rows drawn while a queue is loading. Named so the keys are not array indexes. */
const PLACEHOLDER_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export interface AsyncStateProps {
  readonly isLoading: boolean;
  /** Whatever the query threw, or `null`. */
  readonly error: unknown;
  readonly onRetry: () => void;
  /** What failed to load, e.g. "the approval queue". Used in the failure heading. */
  readonly subject: string;
  readonly children: ReactNode;
}

function LoadingRows() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {PLACEHOLDER_ROWS.map((row) => (
        <Skeleton key={row} className="h-8 w-full" />
      ))}
    </div>
  );
}

/**
 * Renders children once the data is there, and something useful until then.
 *
 * `sonarjs/function-return-type` is disabled for this one function. The rule objects that
 * the three branches return different types — a skeleton, an error panel, and whatever the
 * caller passed — but that is the entire job of the component, and every branch is a
 * `ReactNode`. The alternatives were both worse than the warning: wrapping `children` in a
 * fragment trips `react/jsx-no-useless-fragment`, and forcing the callers to hand over an
 * element rather than a node narrows the API for a lint rule's benefit.
 */
// eslint-disable-next-line sonarjs/function-return-type -- a React component's branches are all ReactNode.
export function AsyncState({
  isLoading,
  error,
  onRetry,
  subject,
  children,
}: AsyncStateProps): ReactNode {
  if (isLoading) return <LoadingRows />;

  if (error) {
    const trace = traceIdFor(error);
    return (
      <ErrorState
        title={`We could not load ${subject}`}
        description={messageFor(error)}
        {...(trace ? { reference: trace } : {})}
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    );
  }

  return children;
}

/**
 * The shape of a TanStack query, narrowed to what this needs.
 *
 * Structural rather than importing `UseQueryResult`, so it also accepts the hand-rolled
 * objects a couple of screens build, and so a caller is not obliged to name the row type.
 */
export interface RetryableQuery {
  readonly isPending: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
}

/**
 * `AsyncState` wired straight to a query.
 *
 * Every screen was spelling out the same four props, including
 * `onRetry={() => { query.refetch(); }}` — a block body only because `refetch` returns a
 * promise the arrow must not return. Repeated at twenty-nine call sites, that is both
 * noise and a place to make a mistake: nothing stopped `isLoading` and `error` being read
 * from two different queries, and the screen would then look loaded while showing nothing.
 *
 * Passing the query itself makes that impossible to express.
 */
export function QueryState({
  query,
  subject,
  children,
}: {
  readonly query: RetryableQuery;
  readonly subject: string;
  readonly children: ReactNode;
}) {
  return (
    <AsyncState
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => {
        query.refetch();
      }}
      subject={subject}
    >
      {children}
    </AsyncState>
  );
}
