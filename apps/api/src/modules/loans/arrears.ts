/**
 * Arrears: what is overdue, how overdue it is, and what must be held against it.
 *
 * Pure functions over a schedule and a business date. Nothing here reads a clock — the
 * date is always passed in — which is precisely what makes advancing the simulated clock
 * produce a month of real arrears rather than a month of nothing happening.
 *
 * Days past due are measured from the *oldest* unpaid instalment, not the most recent. A
 * customer who missed March and then paid April and May is still ninety days down on
 * March, and reporting them as current because the last instalment cleared is how a book
 * hides its losses.
 */

import { Money } from '@reliance/money';

import { fromStored } from '../../common/money/money.codec.js';

import { daysBetween } from './calendar.js';
import { ARREARS_GRACE_DAYS, BPS_SCALE } from './loan.constants.js';
import { type ScheduleRowRecord } from './loan.store.js';
import { DpdBucket } from './loan.types.js';

/** Instalment statuses that still owe money. */
const UNSETTLED_STATUSES: ReadonlySet<ScheduleRowRecord['status']> = new Set([
  'SCHEDULED',
  'PARTIAL',
  'OVERDUE',
]);

/** Bucket boundaries in days past due, ordered widest first. */
const BUCKET_BOUNDARIES: readonly { atLeast: number; bucket: DpdBucket }[] = [
  { atLeast: 90, bucket: DpdBucket.DPD_90_PLUS },
  { atLeast: 60, bucket: DpdBucket.DPD_60_89 },
  { atLeast: 30, bucket: DpdBucket.DPD_30_59 },
  { atLeast: 1, bucket: DpdBucket.DPD_1_29 },
];

/**
 * Loss allowance each bucket calls for, as basis points of the outstanding balance.
 *
 * A staged model: a small collective allowance on performing exposure, rising sharply once
 * an account is more than a quarter down, and full provision at ninety days, which is the
 * point the bank treats the exposure as credit-impaired rather than merely late.
 */
export const PROVISION_RATE_BPS: Readonly<Record<DpdBucket, bigint>> = Object.freeze({
  [DpdBucket.CURRENT]: 100n,
  [DpdBucket.DPD_1_29]: 500n,
  [DpdBucket.DPD_30_59]: 2000n,
  [DpdBucket.DPD_60_89]: 5000n,
  [DpdBucket.DPD_90_PLUS]: 10_000n,
});

/** The bucket a given number of days past due falls into. */
export function bucketForDays(daysPastDue: number): DpdBucket {
  return (
    BUCKET_BOUNDARIES.find((entry) => daysPastDue >= entry.atLeast)?.bucket ?? DpdBucket.CURRENT
  );
}

/**
 * Instalments whose due date plus the grace period has passed and which are not settled.
 *
 * The grace period exists because a payment that lands the morning after a weekend due
 * date is not a missed payment, and charging for it is how a bank earns a complaint it
 * will lose.
 */
export function overdueInstalments(
  schedule: readonly ScheduleRowRecord[],
  asOf: string,
): readonly ScheduleRowRecord[] {
  return schedule.filter(
    (row) =>
      UNSETTLED_STATUSES.has(row.status) && daysBetween(row.dueDate, asOf) > ARREARS_GRACE_DAYS,
  );
}

/**
 * Days past due, measured from the oldest instalment still owing.
 *
 * Measured from the due date itself rather than from the end of the grace period: grace
 * decides *whether* an instalment counts as missed, not how long it has been missed for.
 */
export function daysPastDue(schedule: readonly ScheduleRowRecord[], asOf: string): number {
  const oldest = overdueInstalments(schedule, asOf)[0];
  return oldest ? Math.max(daysBetween(oldest.dueDate, asOf), 0) : 0;
}

/**
 * Everything currently overdue: the unpaid part of each missed instalment, plus its fees.
 *
 * The unpaid *part*, because a customer who paid half an instalment is in arrears for the
 * other half and no more. Charging the full instalment again would double-count.
 */
export function arrearsAmount(
  schedule: readonly ScheduleRowRecord[],
  asOf: string,
  currency: Money['currency'],
): Money {
  return overdueInstalments(schedule, asOf).reduce(
    (total, row) => total.plus(unpaidPortion(row)),
    Money.zero(currency),
  );
}

/** The part of one instalment, fees included, that has not been paid. */
export function unpaidPortion(row: ScheduleRowRecord): Money {
  const due = fromStored(row.payment).plus(fromStored(row.fees));
  const paid = fromStored(row.paidAmount);
  const outstanding = due.minus(paid);

  return outstanding.isPositive ? outstanding : Money.zero(due.currency);
}

/** The loss allowance a bucket calls for against an exposure. */
export function requiredProvision(outstanding: Money, bucket: DpdBucket): Money {
  return outstanding.scaleByRatio(PROVISION_RATE_BPS[bucket], BPS_SCALE);
}

/**
 * Whether an instalment has already been charged a late fee.
 *
 * The sweep runs every business date and must be idempotent across them: a loan three
 * months down is visited ninety times, and each missed instalment attracts exactly one
 * fee. Recording the fee on the row is what makes "charged already" a fact rather than a
 * date calculation that a clock jump could get wrong.
 */
export function isLateFeeCharged(row: ScheduleRowRecord): boolean {
  return fromStored(row.fees).isPositive;
}
