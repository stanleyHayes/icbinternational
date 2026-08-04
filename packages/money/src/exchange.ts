/**
 * Foreign exchange conversion.
 *
 * A rate is stored as a scaled integer (`10845` at scale `4` means `1.0845`), never a
 * float. Conversion between currencies with different minor-unit exponents has to
 * rescale as well as multiply — USD→JPY loses two decimal places, USD→KWD gains one —
 * and doing that in one division keeps the rounding to a single, explicit step.
 */

import { getCurrency, type CurrencyCode } from './currency.js';
import { InvalidAmountError } from './money.errors.js';
import { Money } from './money.js';
import { divideWithRounding, DEFAULT_ROUNDING, type RoundingMode } from './rounding.js';

/** Number of decimal places a quoted FX rate carries. */
export const RATE_SCALE = 8;

export interface ExchangeRate {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  /** Rate × 10^{@link RATE_SCALE}. `1.0845` at scale 8 is `108450000n`. */
  readonly value: bigint;
  readonly scale: number;
}

/** Unsigned decimal — a negative or zero exchange rate is never meaningful. */
const RATE_PATTERN = /^\d+(?:\.\d+)?$/;
const DECIMAL_SEPARATOR = '.';
const NOT_FOUND = -1;

/** Builds a rate from a decimal string, e.g. `'1.0845'`. */
export function rateFromDecimalString(
  from: CurrencyCode,
  to: CurrencyCode,
  decimal: string,
): ExchangeRate {
  const trimmed = decimal.trim();
  if (!RATE_PATTERN.test(trimmed)) {
    throw new InvalidAmountError(decimal, 'exchange rate must be a positive decimal string');
  }

  const separatorAt = trimmed.indexOf(DECIMAL_SEPARATOR);
  const whole = separatorAt === NOT_FOUND ? trimmed : trimmed.slice(0, separatorAt);
  const digits = separatorAt === NOT_FOUND ? '' : trimmed.slice(separatorAt + 1);

  const value = BigInt(`${whole}${digits.slice(0, RATE_SCALE).padEnd(RATE_SCALE, '0')}`);
  if (value === 0n)
    throw new InvalidAmountError(decimal, 'exchange rate must be greater than zero');

  return { from, to, value, scale: RATE_SCALE };
}

/** Inverts a rate, preserving scale. Used to derive the sell side from the buy side. */
export function invertRate(rate: ExchangeRate): ExchangeRate {
  const unit = 10n ** BigInt(rate.scale);
  return {
    from: rate.to,
    to: rate.from,
    value: divideWithRounding(unit * unit, rate.value, DEFAULT_ROUNDING),
    scale: rate.scale,
  };
}

/** Applies a basis-point spread to a rate. 25 bps on 1.0845 → 1.08721…  */
export function applySpread(rate: ExchangeRate, basisPoints: number): ExchangeRate {
  const BPS_DENOMINATOR = 10_000n;
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new InvalidAmountError(basisPoints, 'spread must be a non-negative integer of bps');
  }

  const marked = (rate.value * (BPS_DENOMINATOR + BigInt(basisPoints))) / BPS_DENOMINATOR;
  return { ...rate, value: marked };
}

function assertRateApplies(amount: Money, rate: ExchangeRate): void {
  if (amount.currency !== rate.from) {
    throw new InvalidAmountError(
      amount.currency,
      `rate converts ${rate.from}→${rate.to} and cannot be applied to ${amount.currency}`,
    );
  }
}

/**
 * Converts an amount at the given rate.
 *
 * ```
 *                     amount × rate.value × 10^toExponent
 * result_minor  =  ───────────────────────────────────────────
 *                      10^rate.scale × 10^fromExponent
 * ```
 *
 * One multiplication chain, one division, one rounding decision.
 */
export function convert(
  amount: Money,
  rate: ExchangeRate,
  rounding: RoundingMode = DEFAULT_ROUNDING,
): Money {
  assertRateApplies(amount, rate);

  const fromExponent = getCurrency(rate.from).exponent;
  const toExponent = getCurrency(rate.to).exponent;

  const numerator = amount.amount * rate.value * 10n ** BigInt(toExponent);
  const denominator = 10n ** BigInt(rate.scale) * 10n ** BigInt(fromExponent);

  return Money.fromMinor(divideWithRounding(numerator, denominator, rounding), rate.to);
}

/** Human-readable rate, e.g. `'1.08450000'`. */
export function formatRate(rate: ExchangeRate): string {
  const digits = rate.value.toString().padStart(rate.scale + 1, '0');
  const boundary = digits.length - rate.scale;
  return `${digits.slice(0, boundary)}.${digits.slice(boundary)}`;
}
