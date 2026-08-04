'use client';

/**
 * A contract amount, ready to drop into a row.
 *
 * Every screen in this lane renders amounts that arrive as `{ amount, currency }`, and writing the
 * two props out at each of the two hundred call sites is how one of them ends up passing the wrong
 * currency. This keeps the pairing in one place while still going through `MoneyText`, which
 * remains the only thing in the application that formats money.
 */

import type { Money } from '@reliance/contracts';
import { MoneyText, type MoneyTextSize } from '@reliance/ui';

/** How the amount should read. */
export interface MoneyCellOptions {
  /** Accessible prefix, read before the figure. */
  readonly srLabel?: string;
  readonly size?: MoneyTextSize;
  /** Renders in the inherited colour, for a figure whose direction is stated in words. */
  readonly muted?: boolean;
  /** Forces a leading `+` on credits. */
  readonly signed?: boolean;
  /** Authorised but not settled: gold regardless of sign. */
  readonly pending?: boolean;
}

/** Props for {@link MoneyCell}. */
export interface MoneyCellProps extends MoneyCellOptions {
  readonly money: Money;
  /** Renders the amount as a debit, by prefixing the minus the contract does not carry. */
  readonly negative?: boolean;
}

/**
 * @example <MoneyCell money={quote.fee} muted />
 */
export function MoneyCell({ money, negative, ...options }: MoneyCellProps) {
  const amount = negative && money.amount !== '0' ? `-${money.amount}` : money.amount;

  return <MoneyText amount={amount} currency={money.currency} {...options} />;
}
