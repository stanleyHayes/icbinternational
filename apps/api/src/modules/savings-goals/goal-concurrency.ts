/**
 * The signal a lost race on a vault balance raises.
 *
 * Every vault write is conditional on the balance and movement count the new figure was
 * computed from. When that condition fails, the arithmetic was done against a snapshot
 * that has since moved and the only correct response is to run the whole unit of work
 * again from a fresh read — re-checking the funds, deriving a new ledger reference, and
 * posting against the balance that is actually there.
 *
 * It wears MongoDB's own `TransientTransactionError` label for the same reason
 * `BalanceWriteConflictError` does: `TransactionRunner` already retries anything carrying
 * it, so a conflict the application detected takes the identical path as one the server
 * detected, instead of needing a second retry mechanism that would eventually disagree.
 *
 * Deliberately not an `AppError`. Nothing about the customer's request was wrong, and
 * telling them so would be a lie. If one ever reaches the exception filter it means a
 * vault was moved outside a retrying transaction, which is a defect worth an internal
 * error rather than a plausible-looking rejection.
 */
export class VaultWriteConflictError extends Error {
  /** Read by `TransactionRunner.isRetryable`, matching the driver's own convention. */
  readonly errorLabels: readonly string[] = ['TransientTransactionError'];

  constructor(readonly goalId: string) {
    super(`Savings goal ${goalId} was updated concurrently; the transaction must be retried.`);
    this.name = 'VaultWriteConflictError';
  }
}
