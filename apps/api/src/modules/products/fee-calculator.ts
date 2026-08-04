import {
  ErrorCode,
  type FeeScheduleEntry,
  type Money as WireMoney,
  type Product,
} from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromWire } from '../../common/money/money.codec.js';

import { BASIS_POINTS_DENOMINATOR } from './product.constants.js';

/**
 * Fee arithmetic, with no database and no framework in sight.
 *
 * Every percentage is applied with `Money.scaleByRatio`, which multiplies by an exact
 * integer ratio and rounds once at the end. A float would round twice — once when the
 * rate is stored and once when it is applied — and the two roundings do not commute, so a
 * 1.5% fee on £1,000,000 could differ by a penny depending on where it was computed.
 */

/** Why a fee that would otherwise apply came out at zero. */
export const FeeWaiver = {
  /** The customer's tier is on the entry's waiver list. */
  TIER: 'TIER',
  /** The customer is still inside this month's free allowance. */
  FREE_ALLOWANCE: 'FREE_ALLOWANCE',
  /** The product's schedule does not price this event at all. */
  NOT_PRICED: 'NOT_PRICED',
} as const;
export type FeeWaiver = (typeof FeeWaiver)[keyof typeof FeeWaiver];

/** The outcome of pricing one chargeable event. */
export interface FeeQuote {
  readonly kind: FeeScheduleEntry['kind'];
  readonly label: string;
  readonly fee: Money;
  /** Null when the fee was actually charged. */
  readonly waivedBy: FeeWaiver | null;
  /** Free uses still available this month, after this one. Zero when there is no allowance. */
  readonly freeRemaining: number;
}

/** Everything pricing one event needs. */
export interface FeeInput {
  readonly entry: FeeScheduleEntry;
  /** Amount the proportional component applies to. Zero for a flat-only fee. */
  readonly amount: Money;
  /** Chargeable uses already recorded this calendar month, excluding this one. */
  readonly usedThisMonth: number;
  /** The customer's pricing tier, or null when they are on standard terms. */
  readonly tier: string | null;
}

/** Finds the schedule entry for a fee kind on a product version, or null. */
export function findFeeEntry(
  product: Product,
  kind: FeeScheduleEntry['kind'],
): FeeScheduleEntry | null {
  return product.fees.find((entry) => entry.kind === kind) ?? null;
}

/** The answer when a product's schedule has no entry for the event at all. */
export function unpricedQuote(
  kind: FeeScheduleEntry['kind'],
  currency: Money['currency'],
): FeeQuote {
  return {
    kind,
    label: kind,
    fee: Money.zero(currency),
    waivedBy: FeeWaiver.NOT_PRICED,
    freeRemaining: 0,
  };
}

/**
 * Prices one chargeable event.
 *
 * Order matters: a tier waiver beats the free allowance, because a waived event must not
 * burn an allowance the customer would otherwise still have if they later left the tier.
 */
export function computeFee(input: FeeInput): FeeQuote {
  const { entry, amount } = input;
  const zero = Money.zero(amount.currency);
  const freeRemaining = Math.max(entry.freeAllowancePerMonth - input.usedThisMonth, 0);

  if (input.tier !== null && entry.waivedForTiers.includes(input.tier)) {
    return quote(entry, zero, FeeWaiver.TIER, freeRemaining);
  }

  if (input.usedThisMonth < entry.freeAllowancePerMonth) {
    return quote(entry, zero, FeeWaiver.FREE_ALLOWANCE, freeRemaining - 1);
  }

  return quote(entry, clamp(entry, grossFee(entry, amount)), null, 0);
}

/** The flat and proportional components summed, before the floor and cap. */
function grossFee(entry: FeeScheduleEntry, amount: Money): Money {
  const flat = entry.flatAmount ? sameCurrency(entry, entry.flatAmount, amount) : null;
  const proportional =
    entry.rateBps === null
      ? null
      : amount.abs().scaleByRatio(BigInt(entry.rateBps), BASIS_POINTS_DENOMINATOR);

  const base = flat ?? Money.zero(amount.currency);
  return proportional ? base.plus(proportional) : base;
}

/** Applies the floor, then the cap. A cap below the floor would make the floor a lie. */
function clamp(entry: FeeScheduleEntry, fee: Money): Money {
  const floor = entry.minAmount ? sameCurrency(entry, entry.minAmount, fee) : null;
  const cap = entry.maxAmount ? sameCurrency(entry, entry.maxAmount, fee) : null;

  if (floor && cap && cap.lessThan(floor)) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: `Fee ${entry.kind} is configured with a cap below its floor`,
      context: { kind: entry.kind },
    });
  }

  const floored = floor ? maxOf(fee, floor) : fee;
  return cap ? minOf(floored, cap) : floored;
}

/**
 * Reads a configured amount, insisting it is denominated in the currency being charged.
 *
 * The products module has no exchange rate and must never invent one — a £5 flat fee on a
 * EUR transaction is a catalogue error, not something to convert silently at whatever
 * rate happens to be cached.
 */
function sameCurrency(entry: FeeScheduleEntry, configured: WireMoney, against: Money): Money {
  const money = fromWire(configured);
  if (money.currency === against.currency) return money;

  throw new AppError({
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `Fee ${entry.kind} is priced in ${money.currency} but was charged against ${against.currency}`,
    context: { kind: entry.kind, feeCurrency: money.currency, chargeCurrency: against.currency },
  });
}

function maxOf(left: Money, right: Money): Money {
  return left.greaterThan(right) ? left : right;
}

function minOf(left: Money, right: Money): Money {
  return left.lessThan(right) ? left : right;
}

function quote(
  entry: FeeScheduleEntry,
  fee: Money,
  waivedBy: FeeWaiver | null,
  freeRemaining: number,
): FeeQuote {
  return {
    kind: entry.kind,
    label: entry.label,
    fee,
    waivedBy,
    freeRemaining: Math.max(freeRemaining, 0),
  };
}
