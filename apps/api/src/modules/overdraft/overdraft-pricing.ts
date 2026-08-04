/**
 * What an overdraft costs and how large a one the bank will grant.
 *
 * Pure functions over money and a credit score. Interest is daily and actual/365, computed
 * on the balance actually used rather than the limit granted, and split at the arranged
 * limit so a statement can show the two rates separately even when they are equal today.
 */

import { Money, RoundingMode } from '@reliance/money';

import { BPS_SCALE, DAYS_PER_YEAR } from '../loans/index.js';

import {
  ARRANGED_RATE_BPS,
  FACILITY_SHARE_OF_INCOME_BPS,
  INTEREST_FREE_BUFFER_MINOR_UNITS,
  LIMIT_GRANULARITY_MINOR_UNITS,
  MAX_AUTOMATED_LIMIT_MINOR_UNITS,
  MINIMUM_FACILITY_SCORE,
  UNARRANGED_RATE_BPS,
} from './overdraft.constants.js';

/** How much of a facility is in use, split at the arranged limit. */
export interface Utilisation {
  /** Total overdrawn balance as a positive amount. Zero when the account is in credit. */
  readonly used: Money;
  /** The part within the arranged limit. */
  readonly arranged: Money;
  /** The part beyond it. Zero on a facility that has not been exceeded. */
  readonly unarranged: Money;
  /** Facility granted but not drawn. */
  readonly headroom: Money;
  /** Used over granted, in basis points. Zero when no facility is in place. */
  readonly utilisationBps: number;
}

/**
 * Splits an overdrawn balance against a facility.
 *
 * `ledgerBalance` is signed as the ledger holds it, so an overdrawn account arrives
 * negative and everything this returns is positive. Keeping the sign flip in one place is
 * what stops "how overdrawn is this" from being computed two ways.
 */
export function utilisationOf(ledgerBalance: Money, limit: Money): Utilisation {
  const zero = Money.zero(ledgerBalance.currency);
  const used = ledgerBalance.isNegative ? ledgerBalance.negate() : zero;
  const arranged = used.lessThan(limit) ? used : limit;

  return {
    used,
    arranged,
    unarranged: used.minus(arranged),
    headroom: limit.minus(arranged),
    utilisationBps: limit.isPositive ? Number((used.amount * BPS_SCALE) / limit.amount) : 0,
  };
}

/**
 * A day's interest on a facility.
 *
 * Charged on the balance above the interest-free buffer, actual/365, rounded down so a
 * fraction of a penny always falls to the customer. The arranged and unarranged parts are
 * priced separately even though the rates are currently equal, because the day they differ
 * this function should not have to change shape.
 */
export function dailyInterest(utilisation: Utilisation): Money {
  const currency = utilisation.used.currency;
  const buffer = Money.fromMinor(INTEREST_FREE_BUFFER_MINOR_UNITS, currency);
  if (utilisation.used.lessThanOrEqual(buffer)) return Money.zero(currency);

  const chargeableArranged = reduceBy(utilisation.arranged, buffer);
  return accrue(chargeableArranged, ARRANGED_RATE_BPS).plus(
    accrue(utilisation.unarranged, UNARRANGED_RATE_BPS),
  );
}

/**
 * The facility the automated path will grant.
 *
 * Half of monthly income, rounded down to a round step, capped both by the automated
 * ceiling and by the customer's own request. Nothing is granted below the minimum score:
 * an overdraft is revolving credit with no fixed repayment date, which makes it the most
 * expensive form of lending to get wrong.
 */
export function assignableLimit(input: {
  monthlyIncome: Money;
  creditScore: number;
  requested: Money;
}): Money {
  const currency = input.monthlyIncome.currency;
  if (input.creditScore < MINIMUM_FACILITY_SCORE) return Money.zero(currency);

  const affordable = input.monthlyIncome.scaleByRatio(
    FACILITY_SHARE_OF_INCOME_BPS,
    BPS_SCALE,
    RoundingMode.DOWN,
  );
  const ceiling = Money.fromMinor(MAX_AUTOMATED_LIMIT_MINOR_UNITS, currency);

  return roundDownToStep(least([affordable, ceiling, input.requested]), currency);
}

/** Rounds a facility down to the nearest round step, so limits are always tidy figures. */
export function roundDownToStep(amount: Money, currency: Money['currency']): Money {
  if (!amount.isPositive) return Money.zero(currency);

  const step = LIMIT_GRANULARITY_MINOR_UNITS;
  return Money.fromMinor((amount.amount / step) * step, currency);
}

function accrue(amount: Money, rateBps: number): Money {
  if (!amount.isPositive) return Money.zero(amount.currency);
  return amount.scaleByRatio(BigInt(rateBps), BPS_SCALE * DAYS_PER_YEAR, RoundingMode.DOWN);
}

function reduceBy(amount: Money, deduction: Money): Money {
  const net = amount.minus(deduction);
  return net.isPositive ? net : Money.zero(amount.currency);
}

function least(amounts: readonly Money[]): Money {
  return amounts.reduce((lowest, amount) => (amount.lessThan(lowest) ? amount : lowest));
}
