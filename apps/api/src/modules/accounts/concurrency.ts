/**
 * The signal a lost optimistic-concurrency race raises.
 *
 * Every balance write in this lane is conditional on the account's `version`. When the
 * condition fails, the work that produced the new balances was computed from a snapshot
 * that has since moved, and the only correct response is to run the whole unit of work
 * again from a fresh read — never to retry the write, and never to report a business
 * failure to the customer, because nothing about their request was wrong.
 *
 * `TransactionRunner` already knows how to do exactly that: it retries any error carrying
 * MongoDB's `TransientTransactionError` label. Wearing the same label is what lets a
 * conflict detected by the application take the identical path as one detected by the
 * server, instead of needing a second, parallel retry mechanism that would inevitably
 * disagree with the first.
 *
 * Deliberately not an `AppError`: this is not a business rejection with a contract code,
 * it is a transient condition that the caller above is expected to absorb. If one ever
 * escapes to the exception filter it is a defect — a unit of work that moved a balance
 * outside a retrying transaction — and it should be reported as an internal error, loudly.
 */
export class BalanceWriteConflictError extends Error {
  /** Read by `TransactionRunner.isRetryable`, matching the driver's own convention. */
  readonly errorLabels: readonly string[] = ['TransientTransactionError'];

  constructor(readonly accountId: string) {
    super(`Account ${accountId} was updated concurrently; the transaction must be retried.`);
    this.name = 'BalanceWriteConflictError';
  }
}
