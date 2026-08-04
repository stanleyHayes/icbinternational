/**
 * Arithmetic on amounts that are on their way to the screen.
 *
 * Every figure the console adds up — a trial-balance column, the debit side of a journal
 * entry, an arrears book — is a sum of integer minor units, and it is done in `bigint`
 * here rather than with `Number` anywhere. A console that footed a ledger in floating
 * point would eventually disagree with the ledger by a penny and there would be no way to
 * tell that penny from a real break.
 */

import type { Money } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

/** The zero of every currency, as the wire writes it. */
const ZERO = '0';

/** Adds a list of minor-unit strings. Returns the total as a minor-unit string. */
export function sumMinor(amounts: readonly string[]): string {
  let total = 0n;
  for (const amount of amounts) total += BigInt(amount);
  return total.toString();
}

/** Adds the `amount` of each item. Currency is the caller's responsibility to keep uniform. */
export function sumAmounts(items: readonly Money[]): string {
  return sumMinor(items.map((item) => item.amount));
}

/** `left − right`, in minor units. */
export function subtractMinor(left: string, right: string): string {
  return (BigInt(left) - BigInt(right)).toString();
}

/** The same magnitude with the opposite sign. */
export function negateMinor(amount: string): string {
  return (-BigInt(amount)).toString();
}

/** Magnitude without the sign — for a figure whose direction is stated in words. */
export function absoluteMinor(amount: string): string {
  const value = BigInt(amount);
  return (value < 0n ? -value : value).toString();
}

/** True when the amount is exactly zero. The only safe way to ask of a ledger total. */
export function isZeroMinor(amount: string): boolean {
  return BigInt(amount) === 0n;
}

/** True when the amount is above zero. */
export function isPositiveMinor(amount: string): boolean {
  return BigInt(amount) > 0n;
}

/** Compares two minor-unit strings, for sorting a column of amounts. */
export function compareMinor(left: string, right: string): number {
  const difference = BigInt(left) - BigInt(right);
  if (difference === 0n) return 0;
  return difference > 0n ? 1 : -1;
}

/** A zero amount in the given currency, for an empty total. */
export function zeroIn(currency: CurrencyCode): Money {
  return { amount: ZERO, currency };
}
