/**
 * Minor-unit arithmetic for the mock bank.
 *
 * Amounts are integer strings on the wire, so the mocks do their sums in `bigint` and
 * only stringify at the boundary. A mock that reached for `Number` here would drift by a
 * penny somewhere around a million and teach the UI that balances are approximate —
 * which is the exact belief the real ledger exists to prevent.
 */

import type { Money } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

/** The bank's reporting currency, and the default for every fixture. */
export const BASE_CURRENCY: CurrencyCode = 'GBP';

/** Builds a wire amount from minor units. */
export function money(minor: bigint | number, currency: CurrencyCode = BASE_CURRENCY): Money {
  return { amount: BigInt(minor).toString(), currency };
}

/** Reads a wire amount back into minor units. */
export function minorUnits(value: Money): bigint {
  return BigInt(value.amount);
}

/** Zero in a currency. */
export function zero(currency: CurrencyCode = BASE_CURRENCY): Money {
  return money(0n, currency);
}

/**
 * Adds two amounts.
 *
 * Throws on a currency mismatch rather than coercing. The mock is modelling a bank: two
 * currencies that silently added would produce a coherent-looking screen built on a
 * meaningless number, and the UI lane would never find out.
 */
export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(minorUnits(left) + minorUnits(right), left.currency as CurrencyCode);
}

/** Subtracts `right` from `left`. */
export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(minorUnits(left) - minorUnits(right), left.currency as CurrencyCode);
}

/** Negates an amount. */
export function negateMoney(value: Money): Money {
  return money(-minorUnits(value), value.currency as CurrencyCode);
}

/** Absolute value. */
export function absMoney(value: Money): Money {
  const minor = minorUnits(value);
  return money(minor < 0n ? -minor : minor, value.currency as CurrencyCode);
}

/** Sums a list. An empty list is zero in `currency`. */
export function sumMoney(values: readonly Money[], currency: CurrencyCode = BASE_CURRENCY): Money {
  return values.reduce<Money>((total, value) => addMoney(total, value), zero(currency));
}

/** Applies a rate in basis points, truncating towards zero. */
export function applyBps(value: Money, bps: number): Money {
  const BPS_DIVISOR = 10_000n;
  return money((minorUnits(value) * BigInt(bps)) / BPS_DIVISOR, value.currency as CurrencyCode);
}

/** True when the amount is strictly negative. */
export function isNegative(value: Money): boolean {
  return minorUnits(value) < 0n;
}

/** Compares two amounts of the same currency. */
export function compareMoney(left: Money, right: Money): number {
  assertSameCurrency(left, right);
  const difference = minorUnits(left) - minorUnits(right);
  if (difference === 0n) return 0;
  return difference > 0n ? 1 : -1;
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new TypeError(
      `Mock money arithmetic across currencies: ${left.currency} and ${right.currency}.`,
    );
  }
}
