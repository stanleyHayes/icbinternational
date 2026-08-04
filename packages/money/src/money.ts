/**
 * The `Money` value object — immutable, currency-safe, integer-backed.
 *
 * This is the only type in Reliance Bank permitted to represent a monetary value, and
 * the only place arithmetic on one is legal. Every operation returns a new instance;
 * nothing mutates. Combining two currencies throws rather than guessing a rate.
 */

import { allocateMinor, splitMinor } from './allocate.js';
import { getCurrency, isCurrencyCode, type CurrencyCode } from './currency.js';
import { formatMinor, type FormatOptions } from './format.js';
import { CurrencyMismatchError, InvalidAmountError } from './money.errors.js';
import { formatMinorToMajor, parseMajorToMinor } from './parse.js';
import { divideWithRounding, DEFAULT_ROUNDING, type RoundingMode } from './rounding.js';

/** Wire and storage representation. Minor units travel as a string to survive JSON. */
export interface MoneyJSON {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

export class Money {
  private constructor(
    /** Signed amount in minor units. */
    readonly amount: bigint,
    readonly currency: CurrencyCode,
  ) {
    Object.freeze(this);
  }

  // --- Construction -------------------------------------------------------

  /** Builds from an exact minor-unit amount. The primary constructor. */
  static fromMinor(amount: bigint | number | string, currency: CurrencyCode): Money {
    return new Money(Money.toBigInt(amount), Money.assertCurrency(currency));
  }

  /** Builds from a major-unit decimal *string*, e.g. `'1,234.56'`. Never a float. */
  static fromMajor(value: string, currency: CurrencyCode): Money {
    const code = Money.assertCurrency(currency);
    return new Money(parseMajorToMinor(value, code), code);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, Money.assertCurrency(currency));
  }

  static fromJSON(json: MoneyJSON): Money {
    return Money.fromMinor(json.amount, json.currency);
  }

  private static assertCurrency(currency: CurrencyCode): CurrencyCode {
    if (!isCurrencyCode(currency)) {
      throw new InvalidAmountError(currency, 'unsupported currency code');
    }
    return currency;
  }

  private static toBigInt(amount: bigint | number | string): bigint {
    if (typeof amount === 'bigint') return amount;

    if (typeof amount === 'number') {
      if (!Number.isSafeInteger(amount)) {
        throw new InvalidAmountError(amount, 'minor units must be a safe integer');
      }
      return BigInt(amount);
    }

    if (!/^[+-]?\d+$/.test(amount.trim())) {
      throw new InvalidAmountError(amount, 'expected an integer string of minor units');
    }
    return BigInt(amount.trim());
  }

  // --- Invariants ---------------------------------------------------------

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  // --- Arithmetic ---------------------------------------------------------

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  /** Multiplies by an exact integer factor — e.g. quantity × unit price. */
  times(factor: bigint | number): Money {
    return new Money(this.amount * Money.toBigInt(factor), this.currency);
  }

  /**
   * Multiplies by the rational `numerator / denominator`, rounding once at the end.
   *
   * This is how every percentage in the system is applied — interest rates, fee
   * percentages, FX spreads — because a rate expressed as a ratio of integers never
   * loses precision before the single, explicit rounding step.
   *
   * @example
   * // 7.5% fee on £120.00 → 12000n × 75 / 1000
   * money.scaleByRatio(75n, 1000n);
   */
  scaleByRatio(
    numerator: bigint,
    denominator: bigint,
    rounding: RoundingMode = DEFAULT_ROUNDING,
  ): Money {
    const scaled = divideWithRounding(this.amount * numerator, denominator, rounding);
    return new Money(scaled, this.currency);
  }

  negate(): Money {
    return new Money(-this.amount, this.currency);
  }

  abs(): Money {
    return this.amount < 0n ? this.negate() : this;
  }

  /** Distributes this amount across integer weights without losing a minor unit. */
  allocate(weights: readonly number[]): Money[] {
    return allocateMinor(this.amount, weights).map((part) => new Money(part, this.currency));
  }

  /** Splits into `parts` as-equal-as-possible amounts summing exactly to this one. */
  split(parts: number): Money[] {
    return splitMinor(this.amount, parts).map((part) => new Money(part, this.currency));
  }

  // --- Comparison ---------------------------------------------------------

  /** Returns -1, 0 or 1. Throws on a currency mismatch. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.amount < other.amount) return -1;
    return this.amount > other.amount ? 1 : 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0;
  }

  lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  get isZero(): boolean {
    return this.amount === 0n;
  }

  get isPositive(): boolean {
    return this.amount > 0n;
  }

  get isNegative(): boolean {
    return this.amount < 0n;
  }

  // --- Representation -----------------------------------------------------

  /** Minor-unit decimal places for this currency. */
  get exponent(): number {
    return getCurrency(this.currency).exponent;
  }

  /** Canonical machine string, e.g. `'1234.56'`. Round-trips via `fromMajor`. */
  toMajorString(): string {
    return formatMinorToMajor(this.amount, this.currency);
  }

  /** Locale-aware display string, e.g. `'$1,234.56'`. */
  format(options?: FormatOptions): string {
    return formatMinor(this.amount, this.currency, options);
  }

  toJSON(): MoneyJSON {
    return { amount: this.amount.toString(), currency: this.currency };
  }

  toString(): string {
    return `${this.toMajorString()} ${this.currency}`;
  }
}

/** Sums a list of same-currency amounts. Requires a currency so `[]` is well-defined. */
export function sumMoney(amounts: readonly Money[], currency: CurrencyCode): Money {
  return amounts.reduce<Money>((total, next) => total.plus(next), Money.zero(currency));
}
