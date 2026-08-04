/**
 * Turns an account and a period into the numbers a statement prints.
 *
 * Nothing here writes. Producing a statement is a read of the transaction projection and
 * of the balance the ledger already attested to at each boundary, so asking for one — for
 * any period, as often as the customer likes — cannot move a penny.
 *
 * The archive is built from a **single** scan across the whole span rather than one scan
 * per month. Two years of statements is then two years of rows read once, and each
 * month's opening balance is the previous month's closing balance carried forward, which
 * is the property a customer checks when they line the archive up down the page.
 */

import { Injectable } from '@nestjs/common';

import { Money, type CurrencyCode } from '@reliance/money';

import { type AccountRecord } from '../accounts/index.js';
import {
  TransactionStore,
  type TransactionRecord,
} from '../transactions/repositories/transaction.store.js';
import { TransactionRangeReader } from '../transactions/transaction-range.reader.js';

import { summarise, type StatementFigures } from './statement-figures.js';
import { type StatementPeriod } from './statement-period.js';

/** One period's numbers, without the rows behind them. */
export interface PeriodSummary {
  readonly period: StatementPeriod;
  readonly figures: StatementFigures;
}

/** One period's numbers together with the rows a rendered document lists. */
export interface StatementDetail extends PeriodSummary {
  readonly records: readonly TransactionRecord[];
}

@Injectable()
export class StatementBuilderService {
  constructor(
    private readonly transactions: TransactionStore,
    private readonly range: TransactionRangeReader,
  ) {}

  /**
   * Summaries for consecutive periods, returned in the order they were asked for.
   *
   * The periods must be contiguous and newest-first — which is what `archivePeriods`
   * produces — because each opening balance is taken from the period before it.
   */
  async archive(
    account: AccountRecord,
    periods: readonly StatementPeriod[],
  ): Promise<PeriodSummary[]> {
    const oldest = periods.at(-1);
    const newest = periods.at(0);
    if (!oldest || !newest) return [];

    const records = await this.read(account, oldest.start, newest.end);
    let carried = await this.openingBalance(account, oldest.start);

    const oldestFirst = [...periods].reverse().map((period) => {
      const figures = summarise({
        records: records.filter((record) => within(record, period)),
        opening: carried,
        label: period.label,
      });
      carried = figures.closing;
      return { period, figures };
    });

    return oldestFirst.reverse();
  }

  /** One period, with the rows a rendered statement lists under it. */
  async detail(account: AccountRecord, period: StatementPeriod): Promise<StatementDetail> {
    const records = await this.read(account, period.start, period.end);
    const opening = await this.openingBalance(account, period.start);

    return { period, records, figures: summarise({ records, opening, label: period.label }) };
  }

  /**
   * Where the account stood the instant before the window opened.
   *
   * Zero only when the account genuinely has no history before this point. A period with
   * nothing before it is a new account, which is the one case where zero is the truth.
   */
  private async openingBalance(account: AccountRecord, before: Date): Promise<Money> {
    const previous = await this.transactions.latestBefore({
      userId: account.userId,
      accountId: account.id,
      before,
    });

    return previous
      ? Money.fromMinor(
          previous.runningBalance.amount,
          previous.runningBalance.currency as CurrencyCode,
        )
      : Money.zero(account.currency as CurrencyCode);
  }

  /**
   * Every row on the account in the window, oldest first.
   *
   * Scoped by the account's **owner**, not by whoever asked. Transactions carry the
   * primary holder's id, so scoping by the caller would hand a joint holder an empty
   * statement for an account they hold half of.
   */
  private async read(account: AccountRecord, from: Date, to: Date): Promise<TransactionRecord[]> {
    return this.range.readAll({ userId: account.userId, accountId: account.id, from, to });
  }
}

function within(record: TransactionRecord, period: StatementPeriod): boolean {
  return record.bookedAt >= period.start && record.bookedAt <= period.end;
}
