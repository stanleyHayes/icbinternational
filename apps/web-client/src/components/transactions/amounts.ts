/**
 * The sign of a transaction, decided in exactly one place.
 *
 * On the ledger an amount is *always positive* and the direction carries the sign, because a
 * negative debit is a credit written badly and the trial balance would never find it. On a
 * customer's screen the opposite is true: money out has to read as a minus, or a statement is
 * a column of numbers with no story.
 *
 * Translating between those two conventions is the classic sign error in a banking client, so it
 * happens here and nowhere else. Every figure the money screens render — a row, a donut slice, a
 * CSV cell, a category subtotal — resolves through {@link signedAmount} or {@link signedMinor},
 * which is what makes those four things agree.
 *
 * Arithmetic is `bigint` throughout. Nothing in this module produces a `number`.
 */

import { TransactionDirection, type Money, type Transaction } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

/** The parts of a transaction that determine which way the money went. */
export type Directional = Pick<Transaction, 'amount' | 'direction'>;

/**
 * Magnitude of a wire amount, in minor units.
 *
 * Takes the absolute value rather than trusting the sign: the contract's `moneySchema` permits a
 * negative string, and a debit that arrived already negative would otherwise be negated twice and
 * render as money arriving.
 */
export function absMinor(amount: Money): bigint {
  const minor = BigInt(amount.amount);
  return minor < 0n ? -minor : minor;
}

/** Minor units from the customer's point of view: negative when money left the account. */
export function signedMinor(transaction: Directional): bigint {
  const magnitude = absMinor(transaction.amount);
  return transaction.direction === TransactionDirection.DEBIT ? -magnitude : magnitude;
}

/** The string `MoneyText` wants: signed integer minor units. */
export function signedAmount(transaction: Directional): string {
  return signedMinor(transaction).toString();
}

/** True when the movement took money out of the account. */
export function isDebit(transaction: Directional): boolean {
  return transaction.direction === TransactionDirection.DEBIT;
}

/** Sums minor units. Exact for any total a bank can hold. */
export function sumMinor(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

/** Wraps minor units back into a wire amount, for a component that takes `Money`. */
export function toMoney(minor: bigint, currency: CurrencyCode): Money {
  return { amount: minor.toString(), currency };
}

/** Zero, in a currency. The identity element for every total on these screens. */
export function zeroMoney(currency: CurrencyCode): Money {
  return toMoney(0n, currency);
}

const BASIS_POINTS = 10_000n;

/**
 * `part` as a share of `whole`, in basis points.
 *
 * Basis points rather than a percentage float, matching how the API reports every proportion:
 * a third of a total is `3333`, and it stays `3333` all the way to the axis label.
 */
export function shareBps(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  const magnitude = whole < 0n ? -whole : whole;
  const numerator = part < 0n ? -part : part;
  return Number((numerator * BASIS_POINTS) / magnitude);
}

const BPS_PER_PERCENT = 100;

/** Basis points as a percentage number, for a chart geometry or a CSS width. Never for money. */
export function bpsToPercent(bps: number): number {
  return bps / BPS_PER_PERCENT;
}
