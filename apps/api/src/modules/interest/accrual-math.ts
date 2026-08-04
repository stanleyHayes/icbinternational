/**
 * The accrual arithmetic, kept exact until the one rounding decision the bank makes.
 *
 * Daily accrual never produces a `Money`. It produces an integer *numerator* over the
 * day-count denominator (`bps × 365` on the house convention), accumulated per account.
 * Rounding happens exactly once per capitalisation: the accrued rational is truncated
 * DOWN to whole minor units for posting, and the sub-minor remainder stays in the
 * accumulator to be earned into the next period.
 *
 * That convention is the answer to the classic accrual-drift bug. Round every day and a
 * saver systematically gains or loses a fraction of a penny per day; truncate at
 * capitalisation without carrying the remainder and a year of accrual silently
 * underpays. Carrying the remainder means a full rate-year pays exactly the annual rate,
 * to the minor unit, however many capitalisations fall inside it.
 *
 * Bands are marginal, like income tax — a balance earns the lower rate on the part inside
 * each band and the higher rate only on the overflow, matching the catalogue's pricing
 * in `modules/products/interest-tiers.ts`.
 */

import { ErrorCode, type InterestTier } from '@reliance/contracts';
import { divideWithRounding, Money, RoundingMode } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromWire } from '../../common/money/money.codec.js';

import { ACCRUAL_DENOMINATOR } from './day-count.js';

/** What a capitalisation splits the accumulator into. */
export interface CapitalisationSplit {
  /** Whole minor units to post to the customer. Zero when a period earned a fraction. */
  readonly payable: Money;
  /** The sub-minor fraction left in the accumulator, in denominator units. */
  readonly remainderNumerator: bigint;
}

/**
 * One day's accrual for `balance` across `tiers`, as exact numerator units.
 *
 * Each band contributes `slice × annualRateBps` where `slice` is the part of the balance
 * inside the band. The sum divided by the day-count denominator is the day's interest;
 * the division is deliberately deferred to capitalisation so no day ever rounds.
 */
export function dailyAccrualUnits(tiers: readonly InterestTier[], balance: Money): bigint {
  let units = 0n;

  for (const tier of tiers) {
    const slice = bandSlice(tier, balance);
    if (slice.isPositive) {
      units += slice.amount * BigInt(tier.annualRateBps);
    }
  }

  return units;
}

/**
 * Splits an accumulated numerator into a payable amount and a carried remainder.
 *
 * Truncates DOWN: a fraction of a minor unit is interest not yet earned, so it stays in
 * the accumulator rather than being paid out — the bank never posts money the customer
 * has not quite earned, and never keeps a fraction the customer has.
 */
export function splitCapitalisation(
  numerator: bigint,
  currency: Money['currency'],
): CapitalisationSplit {
  const payable = Money.fromMinor(
    divideWithRounding(numerator, ACCRUAL_DENOMINATOR, RoundingMode.DOWN),
    currency,
  );

  return { payable, remainderNumerator: numerator - payable.amount * ACCRUAL_DENOMINATOR };
}

/** The part of `balance` inside one band, zero when the balance does not reach it. */
function bandSlice(tier: InterestTier, balance: Money): Money {
  const from = sameCurrency(tier.fromAmount, balance);
  if (balance.lessThanOrEqual(from)) return Money.zero(balance.currency);

  const upper =
    tier.toAmount === null ? balance : minOf(balance, sameCurrency(tier.toAmount, balance));
  return upper.minus(from);
}

/**
 * Reads a band boundary, insisting it is denominated in the balance's currency.
 *
 * Mirrors the products lane: a rate table priced in one currency applied to a balance in
 * another is a catalogue error, and there is no exchange rate here to invent one with.
 */
function sameCurrency(configured: InterestTier['fromAmount'], balance: Money): Money {
  const boundary = fromWire(configured);
  if (boundary.currency === balance.currency) return boundary;

  throw new AppError({
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `An interest band is priced in ${boundary.currency} but the balance is in ${balance.currency}`,
    context: { bandCurrency: boundary.currency, balanceCurrency: balance.currency },
  });
}

function minOf(left: Money, right: Money): Money {
  return left.lessThan(right) ? left : right;
}
