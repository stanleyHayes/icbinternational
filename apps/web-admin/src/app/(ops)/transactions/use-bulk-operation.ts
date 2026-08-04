/**
 * Doing the same thing to a lot of postings.
 *
 * Run one at a time rather than in parallel, and never stopped by a single failure. Both
 * choices come from the same place: a bulk action in a bank is a sequence of individually
 * consequential requests, and an operator needs to be told exactly which ones went through
 * — "12 of 40 failed" with no list of which twelve is not an answer anyone can work from.
 */

'use client';

import { useCallback, useState } from 'react';

import { messageFor } from '@/lib/errors';

/** What happened to one item in a bulk run. */
export interface BulkFailure {
  /** How the operator recognises the item — a reference, not an internal id. */
  readonly label: string;
  readonly reason: string;
}

/** Progress and outcome of a bulk run. */
export interface BulkProgress {
  readonly total: number;
  readonly completed: number;
  readonly succeeded: number;
  readonly failures: readonly BulkFailure[];
  readonly isRunning: boolean;
}

const IDLE: BulkProgress = { total: 0, completed: 0, succeeded: 0, failures: [], isRunning: false };

/** Runs an operation over a selection, reporting each outcome. */
export function useBulkOperation<T>() {
  const [progress, setProgress] = useState<BulkProgress>(IDLE);

  const reset = useCallback(() => setProgress(IDLE), []);

  const run = useCallback(
    async (
      items: readonly T[],
      operation: (item: T) => Promise<unknown>,
      label: (item: T) => string,
    ): Promise<void> => {
      setProgress({ ...IDLE, total: items.length, isRunning: true });

      for (const item of items) {
        try {
          await operation(item);
          setProgress((previous) => ({
            ...previous,
            completed: previous.completed + 1,
            succeeded: previous.succeeded + 1,
          }));
        } catch (cause) {
          setProgress((previous) => ({
            ...previous,
            completed: previous.completed + 1,
            failures: [...previous.failures, { label: label(item), reason: messageFor(cause) }],
          }));
        }
      }

      setProgress((previous) => ({ ...previous, isRunning: false }));
    },
    [],
  );

  return { progress, run, reset };
}
