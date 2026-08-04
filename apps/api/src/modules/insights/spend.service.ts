import { Injectable } from '@nestjs/common';

import { type SpendByCategory, type SpendCategory } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { TransactionRangeReader } from '../transactions/transaction-range.reader.js';
import { toIsoInstant } from '../transactions/transaction.presenter.js';

import { allocateBasisPoints, changeInBasisPoints } from './basis-points.js';
import { previousPeriod, type Period } from './period.js';
import { sumTotals, totalsByCategory, type CategoryTotal } from './spend-totals.js';

/** What the caller is asking about. */
export interface SpendQuery {
  readonly userId: string;
  readonly accountId?: string;
  readonly currency: CurrencyCode;
  readonly period: Period;
}

/**
 * Where a customer's money went, and whether that changed.
 *
 * Two properties make this screen trustworthy, and both are structural rather than
 * tested-in:
 *
 * - **It reconciles.** Totals are summed in `bigint` from exactly the rows
 *   `TransactionRangeReader` returns — the same reader the transaction list and the CSV
 *   export use. A customer who adds up their statement gets this number, because it is
 *   the same arithmetic over the same rows.
 * - **Nothing is a float.** Shares are integer basis points allocated by largest
 *   remainder, so they sum to exactly 10,000 and a pie chart adds up to a hundred percent
 *   without the client rounding anything.
 */
@Injectable()
export class SpendService {
  constructor(private readonly range: TransactionRangeReader) {}

  /** Spend by category over the period, with each category's period-over-period change. */
  async spendByCategory(query: SpendQuery): Promise<SpendByCategory> {
    const current = await this.totalsFor(query, query.period);
    const previous = await this.totalsFor(query, previousPeriod(query.period));

    const total = sumTotals(current);
    const shares = allocateBasisPoints(current.map((entry) => entry.minorUnits));
    const previousByCategory = indexByCategory(previous);

    return {
      currency: query.currency,
      from: toIsoInstant(query.period.from),
      to: toIsoInstant(query.period.to),
      total: money(total, query.currency),
      categories: current.map((entry, index) =>
        this.toLine({
          entry,
          shareBps: shares[index] ?? 0,
          previousMinorUnits: previousByCategory.get(entry.category) ?? 0n,
          currency: query.currency,
        }),
      ),
    };
  }

  /**
   * The per-category totals for one window, unshared and unranked.
   *
   * Exposed because the budget service needs exactly this and computing it twice, two
   * ways, is how a budget's "spent" figure drifts away from the spend screen's.
   */
  async totalsFor(
    query: Pick<SpendQuery, 'userId' | 'accountId' | 'currency'>,
    period: Period,
  ): Promise<CategoryTotal[]> {
    const records = await this.range.readAll({
      userId: query.userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      from: period.from,
      to: period.to,
    });

    return totalsByCategory(records, query.currency);
  }

  private toLine(input: {
    entry: CategoryTotal;
    shareBps: number;
    previousMinorUnits: bigint;
    currency: CurrencyCode;
  }): SpendByCategory['categories'][number] {
    return {
      category: input.entry.category,
      total: money(input.entry.minorUnits, input.currency),
      transactionCount: input.entry.transactionCount,
      shareBps: input.shareBps,
      changeFromPreviousBps: changeInBasisPoints(input.entry.minorUnits, input.previousMinorUnits),
    };
  }
}

function indexByCategory(totals: readonly CategoryTotal[]): Map<SpendCategory, bigint> {
  return new Map(totals.map((total) => [total.category, total.minorUnits]));
}

function money(minorUnits: bigint, currency: CurrencyCode) {
  return Money.fromMinor(minorUnits, currency).toJSON();
}
