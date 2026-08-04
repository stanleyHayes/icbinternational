/**
 * What a screen shows while it is waiting, and when the platform refuses.
 *
 * Both states are written once because both are easy to get wrong in the same way. A
 * spinner with no shape makes an operator wonder whether anything is coming; a refusal
 * rendered as a raw code teaches staff to read codes instead of sentences. Here the wait
 * has the shape of the table that is arriving, and the refusal says what happened, what
 * was and was not changed, and offers the trace id separately for the one conversation
 * where it matters.
 */

'use client';

import { RefreshCw } from 'lucide-react';

import { Button, ErrorState, Skeleton } from '@reliance/ui';

import { messageFor, traceIdFor } from '@/lib/errors';

/** Rows drawn while a queue loads. Enough to fill the fold without pretending to be data. */
const PLACEHOLDER_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export interface QueueLoadingProps {
  /** What is being fetched, for the screen-reader announcement: "monitoring alerts". */
  readonly label: string;
}

/** The shape of a queue, while the queue is on its way. */
export function QueueLoading({ label }: QueueLoadingProps) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <output className="sr-only">Loading {label}</output>
      {PLACEHOLDER_ROWS.map((row) => (
        <Skeleton key={row} className="h-9 w-full" />
      ))}
    </div>
  );
}

export interface QueueErrorProps {
  /** Whatever was thrown. Safe to pass an unknown. */
  readonly error: unknown;
  /** What could not be loaded, in the bank's words: "the monitoring alert queue". */
  readonly subject: string;
  readonly onRetry?: () => void;
}

/** A refused or failed read, said the way a bank says it. */
export function QueueError({ error, subject, onRetry }: QueueErrorProps) {
  const traceId = traceIdFor(error);

  return (
    <ErrorState
      title={`We could not load ${subject}`}
      description={messageFor(error)}
      reference={traceId ?? undefined}
      action={
        <Button onClick={onRetry} startIcon={<RefreshCw className="size-4" />}>
          Try again
        </Button>
      }
    />
  );
}

/** The one-line form, for a failure inside a panel that already has its own heading. */
export function failureMessage(error: unknown): string | null {
  return error ? messageFor(error) : null;
}
