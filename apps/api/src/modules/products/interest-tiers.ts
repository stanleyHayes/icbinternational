import { ErrorCode, type InterestTier, type Money as WireMoney } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromWire } from '../../common/money/money.codec.js';

import { BASIS_POINTS_DENOMINATOR } from './product.constants.js';

/**
 * The tiered rate table: which annual rate a balance earns, and how much that is.
 *
 * Bands are marginal, like income tax — a balance that spans two bands earns the lower
 * rate on the part inside the first band and the higher rate only on the overflow. That
 * removes the cliff edge where earning one penny more would reprice the entire balance.
 */

/** The annual rate applying to the topmost band `balance` reaches, or null if it reaches none. */
export function resolveCreditRateBps(
  tiers: readonly InterestTier[],
  balance: Money,
): number | null {
  const tier = tiers.find((candidate) => spans(candidate, balance));
  return tier ? tier.annualRateBps : null;
}

/** The annual interest `balance` earns across every band it spans. */
export function annualCreditInterest(tiers: readonly InterestTier[], balance: Money): Money {
  let total = Money.zero(balance.currency);

  for (const tier of tiers) {
    total = total.plus(bandInterest(tier, balance));
  }

  return total;
}

/** True when `balance` falls inside the tier's `[fromAmount, toAmount)` band. */
function spans(tier: InterestTier, balance: Money): boolean {
  if (balance.lessThan(sameCurrency(tier.fromAmount, balance))) return false;
  if (tier.toAmount === null) return true;
  return balance.lessThan(sameCurrency(tier.toAmount, balance));
}

/** Interest earned by the slice of `balance` inside one band. Zero when it does not reach it. */
function bandInterest(tier: InterestTier, balance: Money): Money {
  const from = sameCurrency(tier.fromAmount, balance);
  if (balance.lessThanOrEqual(from)) return Money.zero(balance.currency);

  const upper =
    tier.toAmount === null ? balance : minOf(balance, sameCurrency(tier.toAmount, balance));

  return upper.minus(from).scaleByRatio(BigInt(tier.annualRateBps), BASIS_POINTS_DENOMINATOR);
}

/**
 * Reads a band boundary, insisting it is denominated in the balance's currency.
 *
 * The products module has no exchange rate and must never invent one — a rate table in
 * EUR applied to a GBP balance is a catalogue error, not a conversion opportunity.
 */
function sameCurrency(configured: WireMoney, balance: Money): Money {
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
