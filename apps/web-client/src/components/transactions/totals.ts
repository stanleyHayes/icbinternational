/**
 * Aggregation over a set of movements — the only place a subtotal is computed.
 *
 * Everything here is `bigint`. A category total is the sum of the same rows the customer can
 * scroll through, which is what makes the donut on Insights reconcile with the list on
 * Transactions to the penny: same rows in, same addition, no second implementation to drift.
 *
 * Currencies are never mixed. Adding £40 to €40 produces 80 of nothing, so a set spanning more
 * than one currency is summarised per currency and the screen says which one it is showing.
 */

import { TransactionDirection, type SpendCategory, type Transaction } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { absMinor, shareBps, signedMinor, sumMinor } from './amounts';

/** One category's share of the spend in a window. */
export interface CategoryTotal {
  readonly category: SpendCategory;
  /** Positive minor units: how much left the account under this category. */
  readonly minor: bigint;
  readonly count: number;
  /** Share of {@link TransactionTotals.spentMinor}, in basis points. */
  readonly shareBps: number;
}

/** One counterparty's share of the spend in a window. */
export interface MerchantTotal {
  readonly name: string;
  readonly minor: bigint;
  readonly count: number;
  readonly lastAt: string;
}

/** Everything the money screens need to know about a set of movements. */
export interface TransactionTotals {
  readonly currency: CurrencyCode;
  readonly count: number;
  /** Sum of credits, positive. */
  readonly receivedMinor: bigint;
  /** Sum of debits, positive — "spent" reads better than "negative money in". */
  readonly spentMinor: bigint;
  /** Received minus spent. Negative when more went out than came in. */
  readonly netMinor: bigint;
  /** Debits grouped by category, largest first. Sums exactly to {@link spentMinor}. */
  readonly byCategory: readonly CategoryTotal[];
  /** Debits grouped by counterparty, largest first. Sums exactly to {@link spentMinor}. */
  readonly byMerchant: readonly MerchantTotal[];
  /** Movements in another currency, excluded from every figure above. */
  readonly excludedCount: number;
  /** True when the window held more movements than the loader will fetch. */
  readonly truncated: boolean;
}

/** The bank's reporting currency, and the fallback when a set is empty. */
export const BASE_CURRENCY: CurrencyCode = 'GBP';

/**
 * Currencies present in a set, most-used first.
 *
 * Drives the currency switch on Insights: a customer with a euro wallet gets to see euro spend,
 * rather than having it quietly dropped from a sterling total.
 */
export function currenciesIn(transactions: readonly Transaction[]): readonly CurrencyCode[] {
  const counts = new Map<CurrencyCode, number>();
  for (const transaction of transactions) {
    const currency = transaction.amount.currency;
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([, left], [, right]) => right - left).map(([code]) => code);
}

function counterpartyName(transaction: Transaction): string {
  return transaction.counterparty?.name ?? transaction.description;
}

function categoryTotals(debits: readonly Transaction[], spent: bigint): readonly CategoryTotal[] {
  const grouped = new Map<SpendCategory, { minor: bigint; count: number }>();

  for (const transaction of debits) {
    const running = grouped.get(transaction.category) ?? { minor: 0n, count: 0 };
    grouped.set(transaction.category, {
      minor: running.minor + absMinor(transaction.amount),
      count: running.count + 1,
    });
  }

  return [...grouped.entries()]
    .map(([category, { minor, count }]) => ({
      category,
      minor,
      count,
      shareBps: shareBps(minor, spent),
    }))
    .sort((left, right) => Number(right.minor - left.minor));
}

function merchantTotals(debits: readonly Transaction[]): readonly MerchantTotal[] {
  const grouped = new Map<string, { minor: bigint; count: number; lastAt: string }>();

  for (const transaction of debits) {
    const name = counterpartyName(transaction);
    const running = grouped.get(name) ?? { minor: 0n, count: 0, lastAt: transaction.bookedAt };
    grouped.set(name, {
      minor: running.minor + absMinor(transaction.amount),
      count: running.count + 1,
      lastAt: running.lastAt > transaction.bookedAt ? running.lastAt : transaction.bookedAt,
    });
  }

  return [...grouped.entries()]
    .map(([name, rest]) => ({ name, ...rest }))
    .sort((left, right) => Number(right.minor - left.minor));
}

/**
 * Summarises the movements held in one currency.
 *
 * @param transactions the complete filtered set — a page of it produces a partial total.
 * @param currency the currency to report in; movements in others are counted and excluded.
 * @param truncated whether the loader stopped before the end of the window.
 */
export function summarise(
  transactions: readonly Transaction[],
  currency: CurrencyCode = BASE_CURRENCY,
  truncated = false,
): TransactionTotals {
  const inCurrency = transactions.filter((transaction) => transaction.amount.currency === currency);
  const debits = inCurrency.filter(
    (transaction) => transaction.direction === TransactionDirection.DEBIT,
  );

  const spentMinor = sumMinor(debits.map((transaction) => absMinor(transaction.amount)));
  const netMinor = sumMinor(inCurrency.map(signedMinor));

  return {
    currency,
    count: inCurrency.length,
    receivedMinor: netMinor + spentMinor,
    spentMinor,
    netMinor,
    byCategory: categoryTotals(debits, spentMinor),
    byMerchant: merchantTotals(debits),
    excludedCount: transactions.length - inCurrency.length,
    truncated,
  };
}

/** How many movements fall in each bucket of a facet, for the counts beside the filter chips. */
export function facetCounts<K extends string>(
  transactions: readonly Transaction[],
  keyOf: (transaction: Transaction) => K,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const transaction of transactions) {
    const key = keyOf(transaction);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
