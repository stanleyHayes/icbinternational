import { Money, type CurrencyCode, type MoneyJSON } from '@reliance/money';

/**
 * Converts between the three representations of an amount.
 *
 * - **Wire** — `{ amount: "123456", currency: "GBP" }`, minor units as a string, because
 *   a JSON number is a double and would quietly round a large balance.
 * - **Storage** — the same shape in Mongo, so a query can compare amounts without
 *   decoding, and no BSON decimal round-trip is involved.
 * - **Domain** — a `Money` instance, the only form arithmetic is permitted on.
 *
 * Keeping all three conversions in one file means there is exactly one place to look when
 * an amount comes out wrong, and exactly one place to change if storage ever moves.
 */

/** Shape persisted in MongoDB. Identical to the wire shape, deliberately. */
export interface StoredMoney {
  amount: string;
  currency: string;
}

export function toWire(money: Money): MoneyJSON {
  return money.toJSON();
}

export function fromWire(wire: MoneyJSON): Money {
  return Money.fromMinor(wire.amount, wire.currency);
}

export function toStored(money: Money): StoredMoney {
  return { amount: money.amount.toString(), currency: money.currency };
}

export function fromStored(stored: StoredMoney): Money {
  return Money.fromMinor(stored.amount, stored.currency as CurrencyCode);
}

/** Convenience for the common case of reading an optional stored amount. */
export function fromStoredOrZero(
  stored: StoredMoney | null | undefined,
  currency: CurrencyCode,
): Money {
  return stored ? fromStored(stored) : Money.zero(currency);
}
