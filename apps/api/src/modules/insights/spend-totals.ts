import { TransactionDirection, TransactionStatus, type SpendCategory } from '@reliance/contracts';

import { type TransactionRecord } from '../transactions/repositories/transaction.store.js';

/** A category's contribution to a period's spend, in minor units. */
export interface CategoryTotal {
  readonly category: SpendCategory;
  readonly minorUnits: bigint;
  readonly transactionCount: number;
}

/**
 * Which rows count as spend.
 *
 * Debits only — money leaving the account. Credits are income or refunds and putting them
 * in a spend total nets them off, which turns "you spent £400 on groceries and got a £20
 * refund" into "you spent £380 on groceries", hiding both facts.
 *
 * Reversed and failed movements are excluded because the money came back; a disputed one
 * is included because it has not, and the customer is out of pocket while the dispute
 * runs. Pending is included for the same reason — the money is gone from their available
 * balance whether or not the rail has settled.
 */
const COUNTED_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  TransactionStatus.COMPLETED,
  TransactionStatus.PENDING,
  TransactionStatus.DISPUTED,
]);

/** True when the row is money the customer actually spent in this currency. */
function isSpend(record: TransactionRecord, currency: string): boolean {
  return (
    record.direction === TransactionDirection.DEBIT &&
    COUNTED_STATUSES.has(record.status) &&
    record.amount.currency === currency
  );
}

/**
 * Sums spend per category.
 *
 * Summed in `bigint` from the same rows the transaction list returns, rather than
 * aggregated in the database, so the two cannot disagree. A customer who adds up their
 * statement by hand and compares it against this screen must get the same number — and
 * they do check.
 */
export function totalsByCategory(
  records: readonly TransactionRecord[],
  currency: string,
): CategoryTotal[] {
  const totals = new Map<SpendCategory, { minorUnits: bigint; transactionCount: number }>();

  for (const record of records) {
    if (!isSpend(record, currency)) continue;

    const running = totals.get(record.category);
    totals.set(record.category, {
      minorUnits: (running?.minorUnits ?? 0n) + BigInt(record.amount.amount),
      transactionCount: (running?.transactionCount ?? 0) + 1,
    });
  }

  return (
    [...totals.entries()]
      .map(([category, total]) => ({ category, ...total }))
      // Largest first: the answer to "where does my money go" is the top of this list, and
      // a client should not have to sort to render it correctly.
      .sort((left, right) => compare(right.minorUnits, left.minorUnits))
  );
}

/** Total spend across every category, in minor units. */
export function sumTotals(totals: readonly CategoryTotal[]): bigint {
  return totals.reduce((sum, total) => sum + total.minorUnits, 0n);
}

function compare(left: bigint, right: bigint): number {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}
