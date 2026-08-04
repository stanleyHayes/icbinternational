/**
 * The money colour rule, in one function.
 *
 * Credit is green, debit is the brand red, pending is gold. Fixed system-wide — in tables, in
 * charts, on the card art — because a user who has learned that green means money arrived cannot
 * be asked to re-learn it on the insights screen.
 *
 * Zero is deliberately neutral rather than red: a nil balance is not a debit, and colouring it as
 * one tells the customer something alarming and untrue.
 */

import { MONEY_ROLE, type MoneyDirection } from '../foundation/tokens.js';

/** Text colour utility per direction. */
const TEXT_CLASS: Readonly<Record<MoneyDirection, string>> = {
  credit: 'text-credit',
  debit: 'text-debit',
  pending: 'text-pending',
  zero: 'text-fg',
};

/**
 * Classifies an amount.
 *
 * `pending` wins over the sign: an authorisation that has not settled is provisional whichever
 * way the money is going, and showing it in settled green is a promise the ledger has not made.
 */
export function moneyDirection(minorUnits: bigint, pending = false): MoneyDirection {
  if (pending) return 'pending';
  if (minorUnits > 0n) return 'credit';
  return minorUnits < 0n ? 'debit' : 'zero';
}

/** Tailwind text colour for a direction. */
export function moneyTextClass(direction: MoneyDirection): string {
  return TEXT_CLASS[direction];
}

/** The CSS variable for a direction — for SVG strokes and chart series. */
export function moneyRole(direction: MoneyDirection): string {
  return MONEY_ROLE[direction];
}
