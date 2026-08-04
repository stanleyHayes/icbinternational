import { CustomerSegment } from '@reliance/contracts';
import { applySpread, type CurrencyCode, type ExchangeRate } from '@reliance/money';

import { BPS_DENOMINATOR } from './fx.constants.js';

/**
 * What the bank charges over the mid-market rate, and how that becomes a customer rate.
 *
 * The spread is the only charge on a conversion — there is no separate fee — so it is
 * stated in basis points, shown to the customer as money before they commit, and
 * recognised as income on its own general-ledger account. A bank that buries its margin
 * in the rate is not charging less, it is disclosing less.
 *
 * Two things move the number: how liquid the pair is, and who is asking. Both are
 * defensible commercial reasons and neither is a secret.
 */

/** Who is being quoted. Enough to price them, and nothing more. */
export interface CustomerTier {
  readonly segment: CustomerSegment;
  /** Verification depth, 0–3. A fully verified customer is a cheaper customer to serve. */
  readonly kycTier: number;
}

/** Spread over mid for a deeply liquid pair, in basis points. */
const MAJOR_BPS = 30;

/** Spread for a liquid but less-traded pair — the Nordics and developed Asia. */
const SECONDARY_BPS = 55;

/** Spread for pegged Gulf currencies, where the bank's own funding costs more. */
const PEGGED_BPS = 70;

/** Spread for pairs where the bank has to work an order to fill it. */
const EMERGING_BPS = 120;

/** Discount for a business customer, whose flow is larger and more predictable. */
const BUSINESS_DISCOUNT_BPS = 10;

/** Discount per verification tier above the first. */
const TIER_DISCOUNT_BPS = 4;

/** Verification tier at which the discount starts to apply. */
const DISCOUNT_FROM_TIER = 1;

/** The bank never quotes tighter than this, whatever the discounts add up to. */
const MINIMUM_BPS = 12;

const MAJORS = new Set<CurrencyCode>(['GBP', 'USD', 'EUR', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD']);
const SECONDARY = new Set<CurrencyCode>(['SEK', 'NOK', 'DKK', 'SGD', 'HKD', 'CNY']);
const PEGGED = new Set<CurrencyCode>(['AED', 'SAR', 'BHD', 'KWD']);

/** The wider of the two legs decides the pair: a cross is only as liquid as its weak side. */
export function pairSpreadBps(from: CurrencyCode, to: CurrencyCode): number {
  return Math.max(legSpreadBps(from), legSpreadBps(to));
}

function legSpreadBps(code: CurrencyCode): number {
  if (MAJORS.has(code)) return MAJOR_BPS;
  if (SECONDARY.has(code)) return SECONDARY_BPS;
  if (PEGGED.has(code)) return PEGGED_BPS;
  return EMERGING_BPS;
}

/** The all-in spread this customer is quoted on this pair. */
export function spreadBpsFor(input: {
  from: CurrencyCode;
  to: CurrencyCode;
  customer: CustomerTier;
}): number {
  const base = pairSpreadBps(input.from, input.to);
  const business = input.customer.segment === CustomerSegment.BUSINESS ? BUSINESS_DISCOUNT_BPS : 0;
  const verified = Math.max(input.customer.kycTier - DISCOUNT_FROM_TIER, 0) * TIER_DISCOUNT_BPS;

  return Math.max(base - business - verified, MINIMUM_BPS);
}

/** Half the spread sits on each side of mid, which is what makes the board symmetrical. */
export function halfOf(spreadBps: number): number {
  return Math.round(spreadBps / 2);
}

/**
 * Mid marked *up*: more of the quote currency per unit of the base.
 *
 * The ask side of the board, and the rate a customer pays when they are buying the base
 * currency.
 */
export function markUp(rate: ExchangeRate, basisPoints: number): ExchangeRate {
  return applySpread(rate, basisPoints);
}

/**
 * Mid marked *down*: the exact reciprocal counterpart of {@link markUp}.
 *
 * Expressed as one division rather than as `invert(markUp(invert(rate)))`, which is the
 * same quantity algebraically but not numerically: inverting a rate like GBP/JPY at scale
 * 8 leaves five significant digits, and marking that up then inverting it back would move
 * the customer's rate by a basis point of pure rounding. A quote has to be reproducible
 * to the last minor unit, so the mark-down is computed at full scale in one step.
 */
export function markDown(rate: ExchangeRate, basisPoints: number): ExchangeRate {
  assertBasisPoints(basisPoints);
  const denominator = BigInt(BPS_DENOMINATOR + basisPoints);
  return { ...rate, value: (rate.value * BigInt(BPS_DENOMINATOR)) / denominator };
}

function assertBasisPoints(basisPoints: number): void {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError('A spread must be a non-negative whole number of basis points');
  }
}
