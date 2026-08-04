/**
 * The savings projection behind the public site.
 *
 * Compounds month by month on integer minor units, which is how interest is actually
 * credited — daily accrual paid monthly, rounded to the penny each time. A closed-form
 * compound-interest formula would give a slightly different figure to the one the customer
 * eventually sees, and "slightly different" on a savings projection is a complaint.
 *
 * Pure, integer-only.
 */

import { Money, type CurrencyCode } from '@reliance/money';

const MONTHS_PER_YEAR = 12;
const BASIS_POINTS_PER_UNIT = 10_000n;
const MONTHS_PER_YEAR_BIG = 12n;

export interface SavingsProjectionInput {
  readonly openingBalanceMinorUnits: bigint;
  readonly monthlyDepositMinorUnits: bigint;
  readonly annualRateBasisPoints: number;
  readonly years: number;
  readonly currency: CurrencyCode;
}

export interface YearlyBalance {
  readonly year: number;
  readonly balanceMinorUnits: bigint;
  readonly interestEarnedMinorUnits: bigint;
  readonly depositedMinorUnits: bigint;
}

export interface SavingsProjection {
  readonly finalBalance: Money;
  readonly totalDeposited: Money;
  readonly totalInterest: Money;
  readonly byYear: readonly YearlyBalance[];
}

/** One month's interest on a balance, rounded half-up to the minor unit. */
function monthlyInterest(balance: bigint, annualRateBasisPoints: bigint): bigint {
  if (balance <= 0n || annualRateBasisPoints <= 0n) return 0n;

  const numerator = balance * annualRateBasisPoints;
  const denominator = BASIS_POINTS_PER_UNIT * MONTHS_PER_YEAR_BIG;
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Projects a balance forward.
 *
 * The deposit goes in at the start of the month and earns interest that month — which is
 * the convention on a monthly-paid account and the assumption the site states beside the
 * figure.
 *
 * @throws {RangeError} when the term is not a positive number of years.
 */
export function projectSavings(input: SavingsProjectionInput): SavingsProjection {
  if (input.years <= 0) throw new RangeError('A projection needs at least one year');

  const rate = BigInt(input.annualRateBasisPoints);
  const byYear: YearlyBalance[] = [];

  let balance = input.openingBalanceMinorUnits;
  let deposited = input.openingBalanceMinorUnits;
  let interestEarned = 0n;

  for (let year = 1; year <= input.years; year += 1) {
    for (let month = 0; month < MONTHS_PER_YEAR; month += 1) {
      balance += input.monthlyDepositMinorUnits;
      deposited += input.monthlyDepositMinorUnits;

      const interest = monthlyInterest(balance, rate);
      balance += interest;
      interestEarned += interest;
    }

    byYear.push({
      year,
      balanceMinorUnits: balance,
      interestEarnedMinorUnits: interestEarned,
      depositedMinorUnits: deposited,
    });
  }

  return {
    finalBalance: Money.fromMinor(balance, input.currency),
    totalDeposited: Money.fromMinor(deposited, input.currency),
    totalInterest: Money.fromMinor(interestEarned, input.currency),
    byYear,
  };
}
