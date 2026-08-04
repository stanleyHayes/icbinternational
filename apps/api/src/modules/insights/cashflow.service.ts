import { Injectable } from '@nestjs/common';

import { TransactionDirection, type Cashflow } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import {
  TransactionStore,
  type TransactionRecord,
} from '../transactions/repositories/transaction.store.js';
import { TransactionRangeReader } from '../transactions/transaction-range.reader.js';

import { enumerateBuckets, type Bucket, type CashflowGranularity } from './cashflow-buckets.js';
import { type Period } from './period.js';

/**
 * What the caller is asking about.
 *
 * `accountId` is required, unlike every other insight. A closing balance is a property of
 * an account, not of a person: summing the balances of a current account and a savings
 * pot produces a number that is on no statement and answers no question. A customer with
 * several accounts asks several times.
 */
export interface CashflowQuery {
  readonly userId: string;
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly period: Period;
  readonly granularity: CashflowGranularity;
}

/**
 * Money in, money out, and where the balance stood at the end of each bucket.
 *
 * The closing balance is **read off** the last transaction in the bucket, never
 * recomputed. `runningBalance` was written by the projector inside the posting
 * transaction from the account's real balance at that instant — a recorded fact, not a
 * derived one. Accumulating flows instead would drift the moment anything reached the
 * balance by a path this range does not see: a posting before the window opened, an
 * interest accrual, a correction. The recorded value cannot drift, because it was never
 * calculated here.
 *
 * A bucket with no transactions carries the previous closing balance forward. Nothing
 * happening does not mean the balance became zero, and a chart that drops to zero for a
 * quiet fortnight is the kind of wrong that generates a support ticket.
 */
@Injectable()
export class CashflowService {
  constructor(
    private readonly range: TransactionRangeReader,
    private readonly transactions: TransactionStore,
  ) {}

  /** One bucket per slot in the period, including the empty ones. */
  async cashflow(query: CashflowQuery): Promise<Cashflow> {
    const records = await this.readInCurrency(query);
    const buckets = enumerateBuckets(query.period, query.granularity);
    let carried = await this.openingBalance(query);

    const summarised = buckets.map((bucket) => {
      const summary = summarise({
        records: records.filter((record) => within(record, bucket)),
        bucket,
        currency: query.currency,
        carried,
      });
      carried = Money.fromMinor(summary.closingBalance.amount, query.currency);
      return summary;
    });

    return { currency: query.currency, buckets: summarised };
  }

  /**
   * Where the account stood the instant before the window opened.
   *
   * Zero only when the account genuinely has no history before this point — a brand new
   * account, which is the one case where zero is the truth.
   */
  private async openingBalance(query: CashflowQuery): Promise<Money> {
    const previous = await this.transactions.latestBefore({
      userId: query.userId,
      accountId: query.accountId,
      before: query.period.from,
    });

    if (!previous || previous.runningBalance.currency !== query.currency) {
      return Money.zero(query.currency);
    }
    return Money.fromMinor(previous.runningBalance.amount, query.currency);
  }

  private async readInCurrency(query: CashflowQuery): Promise<TransactionRecord[]> {
    const records = await this.range.readAll({
      userId: query.userId,
      accountId: query.accountId,
      from: query.period.from,
      to: query.period.to,
    });

    // Summing two currencies is arithmetic on two different things. An account holds one,
    // so this filter normally removes nothing — and says so loudly if that ever changes.
    return records.filter((record) => record.amount.currency === query.currency);
  }
}

function within(record: TransactionRecord, bucket: Bucket): boolean {
  return record.bookedAt >= bucket.from && record.bookedAt <= bucket.to;
}

/**
 * One bucket's totals.
 *
 * `moneyIn` and `moneyOut` are both positive magnitudes and `net` carries the sign, so a
 * chart draws two bars without negating one and nobody has to interpret a minus sign in
 * the column headed "money out".
 */
function summarise(input: {
  records: readonly TransactionRecord[];
  bucket: Bucket;
  currency: CurrencyCode;
  carried: Money;
}): Cashflow['buckets'][number] {
  let moneyIn = Money.zero(input.currency);
  let moneyOut = Money.zero(input.currency);

  for (const record of input.records) {
    const amount = Money.fromMinor(record.amount.amount, input.currency);
    if (record.direction === TransactionDirection.CREDIT) moneyIn = moneyIn.plus(amount);
    else moneyOut = moneyOut.plus(amount);
  }

  return {
    period: input.bucket.period,
    moneyIn: moneyIn.toJSON(),
    moneyOut: moneyOut.toJSON(),
    net: moneyIn.minus(moneyOut).toJSON(),
    closingBalance: closingBalanceOf(input.records, input.currency, input.carried).toJSON(),
  };
}

/**
 * The balance recorded against the latest transaction in the bucket.
 *
 * "Latest" is decided by `bookedAt` with the ULID id as tie-break — the same total order
 * the statement uses — rather than by position in the array. Back-valued postings arrive
 * out of booking order, and taking the last element would then read the balance from a
 * transaction that happened earlier.
 */
function closingBalanceOf(
  records: readonly TransactionRecord[],
  currency: CurrencyCode,
  carried: Money,
): Money {
  const latest = records.reduce<TransactionRecord | null>(
    (best, record) => (best === null || isLater(record, best) ? record : best),
    null,
  );

  return latest ? Money.fromMinor(latest.runningBalance.amount, currency) : carried;
}

function isLater(candidate: TransactionRecord, incumbent: TransactionRecord): boolean {
  if (candidate.bookedAt.getTime() !== incumbent.bookedAt.getTime()) {
    return candidate.bookedAt > incumbent.bookedAt;
  }
  return candidate.id > incumbent.id;
}
