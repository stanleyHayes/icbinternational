import { type ClientSession } from 'mongoose';

import { type Money } from '@reliance/money';

import { type StoredMoney } from '../../common/money/money.codec.js';

/**
 * What a service is allowed to know about accrual-state persistence.
 *
 * An abstract class rather than an interface for the same reason the accounts lane does
 * it: Nest resolves the class as both type and injection token, so services depend on
 * this and only the repository knows Mongoose exists.
 *
 * Both writes are compare-and-set on the stamps *and* the numerator. The stamps make a
 * rerun a no-op; including the numerator makes an accrual racing a capitalisation lose
 * cleanly instead of silently discarding one of the two updates — the loser re-reads and
 * tries again on the next run.
 */
export abstract class AccrualStateStore {
  abstract findByAccountId(
    accountId: string,
    session?: ClientSession,
  ): Promise<AccrualStateRecord | null>;

  /**
   * Adds a day's accrual, creating the state on first use.
   *
   * @returns false when the state moved between read and write — another accrual already
   *   landed for this account, so the caller's increment must not be reapplied.
   */
  abstract applyAccrual(input: ApplyAccrualInput): Promise<boolean>;

  /**
   * Records a capitalisation: the paid amount, the carried remainder, the settled period.
   *
   * @returns false when the state moved between read and write.
   */
  abstract applyCapitalisation(input: ApplyCapitalisationInput): Promise<boolean>;
}

/** A persisted accrual state as services see it — a plain value, no `.save()`. */
export interface AccrualStateRecord {
  readonly accountId: string;
  readonly currency: string;
  /** Exact accrual over the day-count denominator. */
  readonly numerator: bigint;
  readonly lastAccruedOn: string | null;
  readonly lastCapitalisedPeriod: string | null;
  readonly capitalisedToDate: StoredMoney;
}

/** A day's accrual, conditional on the state the caller read. */
export interface ApplyAccrualInput {
  readonly accountId: string;
  readonly currency: string;
  /** The `lastAccruedOn` the caller read — null when no state exists yet. */
  readonly expectedLastAccruedOn: string | null;
  /** The numerator the caller read — zero when no state exists yet. */
  readonly expectedNumerator: bigint;
  /** The new numerator: read value plus the day's increment. */
  readonly numerator: bigint;
  /** The business date being stamped. */
  readonly accruedOn: string;
  readonly session?: ClientSession;
}

/** A settled month, conditional on the state the caller read. */
export interface ApplyCapitalisationInput {
  readonly accountId: string;
  /** The `lastCapitalisedPeriod` the caller read — null when never capitalised. */
  readonly expectedLastCapitalisedPeriod: string | null;
  /** The numerator the caller read. */
  readonly expectedNumerator: bigint;
  /** The sub-minor remainder carried into the next period. */
  readonly numerator: bigint;
  /** The period just settled (`YYYY-MM`). */
  readonly period: string;
  /** The new running total of interest paid. */
  readonly capitalisedToDate: Money;
  readonly session?: ClientSession;
}
