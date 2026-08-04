/**
 * Structural narrowing for "anything that looks like money".
 *
 * The matchers and builders accept the domain `Money` value object, its wire form
 * (`MoneyJSON` / the contract `moneySchema` shape) and hydrated Mongoose subdocuments.
 * All three are structurally `{ amount, currency }`; this module normalises them to a
 * single comparable form without doing arithmetic — arithmetic stays in `@reliance/money`.
 */

import { isCurrencyCode, type CurrencyCode } from '@reliance/money';

/** Anything the money-aware helpers in this package can read. */
export interface MoneyLike {
  readonly amount: bigint | number | string;
  readonly currency: string;
}

/** Normalised, comparable form of a {@link MoneyLike}. */
export interface NormalisedMoney {
  readonly amount: bigint;
  readonly currency: CurrencyCode;
}

/** Narrows an unknown value to a money-shaped object. */
export function isMoneyLike(value: unknown): value is MoneyLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const amountOk =
    typeof candidate.amount === 'bigint' ||
    typeof candidate.amount === 'number' ||
    typeof candidate.amount === 'string';
  return amountOk && typeof candidate.currency === 'string';
}

/**
 * Normalises a money-shaped value, or returns `null` with no throw when the value is
 * not usable — matchers report mismatches, they do not blow up on bad input.
 */
export function normaliseMoney(value: unknown): NormalisedMoney | null {
  if (!isMoneyLike(value)) return null;
  if (!isCurrencyCode(value.currency)) return null;

  const amount = toMinorBigint(value.amount);
  if (amount === null) return null;

  return { amount, currency: value.currency };
}

function toMinorBigint(amount: bigint | number | string): bigint | null {
  if (typeof amount === 'bigint') return amount;
  if (typeof amount === 'number') {
    return Number.isSafeInteger(amount) ? BigInt(amount) : null;
  }
  const trimmed = amount.trim();
  return /^[+-]?\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}

/** Human-readable rendering for matcher messages, e.g. `1250 GBP`. */
export function describeMoney(value: unknown): string {
  const normalised = normaliseMoney(value);
  if (!normalised) return `not money-shaped (${typeof value})`;
  return `${normalised.amount.toString()} minor ${normalised.currency}`;
}
