import { Money, RoundingMode } from '@reliance/money';

/**
 * Calendar-month arithmetic for the maintenance fee, with no database and no framework.
 *
 * Months are UTC calendar months. The products module measures free allowances in the
 * customer's timezone, but a monthly account fee is a bookkeeping period, not a
 * customer-facing allowance, and the ledger's value dates are UTC day-granular.
 */

/** One UTC calendar month: its key, its bounds, and how many days it contains. */
export interface MonthPeriod {
  /** `YYYY-MM`, the period half of a scheduled charge key. */
  readonly key: string;
  /** Inclusive start: midnight UTC on the first. */
  readonly start: Date;
  /** Exclusive end: midnight UTC on the first of the next month. */
  readonly end: Date;
  readonly daysInMonth: number;
}

/** The pro-rating fraction of a period a fee is scaled by. */
export interface ProRata {
  /** Days in the period the account was open and chargeable. */
  readonly activeDays: number;
  readonly daysInMonth: number;
}

const MONTH_PAD = 2;
const DAY_MS = 86_400_000;

/** The UTC calendar month containing `instant`. */
export function monthPeriodOf(instant: Date): MonthPeriod {
  return periodFor(instant.getUTCFullYear(), instant.getUTCMonth());
}

/**
 * The UTC calendar month immediately before the one containing `instant`.
 *
 * Maintenance is charged in arrears: the month must be fully over before its fee is
 * assessed, because only then is the number of chargeable days known exactly.
 */
export function monthPeriodBefore(instant: Date): MonthPeriod {
  return periodFor(instant.getUTCFullYear(), instant.getUTCMonth() - 1);
}

/**
 * How many days of `period` the account was open for.
 *
 * A day counts when the account was open at any instant of it: opened at 23:00 on the
 * 10th, the 10th still counts. Counting whole calendar days rather than measuring
 * milliseconds sidesteps every rounding argument about what a "day" of membership is.
 */
export function activeDaysWithin(
  period: MonthPeriod,
  openedAt: Date,
  closedAt: Date | null,
): number {
  let days = 0;

  for (let day = 0; day < period.daysInMonth; day += 1) {
    const dayStart = period.start.getTime() + day * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const openThatDay = openedAt.getTime() < dayEnd;
    const stillOpenThatDay = closedAt === null || closedAt.getTime() > dayStart;

    if (openThatDay && stillOpenThatDay) days += 1;
  }

  return days;
}

/**
 * Scales a fee by the fraction of the period the account was open.
 *
 * The ratio is applied with exact integer arithmetic and rounded once, half-even — the
 * same rule the rest of the platform rounds money by. A full period and a waived
 * (zero) fee pass through untouched, so the common cases allocate nothing.
 */
export function applyProRata(amount: Money, proRata: ProRata | undefined): Money {
  if (!proRata || proRata.activeDays >= proRata.daysInMonth) return amount;
  if (proRata.activeDays <= 0) return Money.zero(amount.currency);

  return amount.scaleByRatio(
    BigInt(proRata.activeDays),
    BigInt(proRata.daysInMonth),
    RoundingMode.HALF_EVEN,
  );
}

/** The period for a (possibly negative) zero-based month index of a year. */
function periodFor(year: number, monthIndex: number): MonthPeriod {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));

  return {
    key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(MONTH_PAD, '0')}`,
    start,
    end,
    daysInMonth: Math.round((end.getTime() - start.getTime()) / DAY_MS),
  };
}
