/**
 * Fluent builder for `Money` value objects and their wire form.
 *
 * The default is a deterministic positive GBP amount; override exactly the field a
 * test cares about and let the rest stay boring.
 */

import { Money, type CurrencyCode, type MoneyJSON } from '@reliance/money';

import { Builder } from './builder.js';

/** Accepted forms of a minor-unit amount on builder inputs. */
export type MinorUnitsInput = bigint | number | string;

/** Default: £1,250.00 — a plausible current-account balance. */
const DEFAULT_MINOR = 125_000n;
const DEFAULT_CURRENCY: CurrencyCode = 'GBP';

/** Builds {@link Money} instances or their `MoneyJSON` wire shape. */
export class MoneyBuilder extends Builder<Money> {
  private amount: bigint = DEFAULT_MINOR;
  private currency: CurrencyCode = DEFAULT_CURRENCY;

  /** Sets the exact minor-unit amount. */
  withMinor(amount: MinorUnitsInput): this {
    this.amount = Money.fromMinor(amount, this.currency).amount;
    return this;
  }

  /** Sets the amount from a major-unit decimal string, e.g. `'1,234.56'`. */
  withMajor(value: string): this {
    this.amount = Money.fromMajor(value, this.currency).amount;
    return this;
  }

  /** Sets the currency. */
  withCurrency(currency: CurrencyCode): this {
    this.currency = currency;
    return this;
  }

  /** Zero in the current currency. */
  zero(): this {
    this.amount = 0n;
    return this;
  }

  build(): Money {
    return Money.fromMinor(this.amount, this.currency);
  }

  /** Builds the wire/storage shape instead of the value object. */
  buildJSON(): MoneyJSON {
    return this.build().toJSON();
  }
}

/** Entry point: `aMoney().withMajor('10.00').build()`. */
export function aMoney(): MoneyBuilder {
  return new MoneyBuilder();
}
