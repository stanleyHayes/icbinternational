/**
 * Errors raised by the money primitives.
 *
 * These are deliberately distinct classes rather than generic `Error`s: a currency
 * mismatch is a programming defect that must fail loudly in tests, whereas an invalid
 * user-supplied amount is a validation failure the API layer maps to a 400. Conflating
 * them makes it possible to accidentally swallow the first.
 */

import { type CurrencyCode } from './currency.js';

/** Base class for everything thrown by `@reliance/money`. */
export abstract class MoneyError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when an operation combines two different currencies. */
export class CurrencyMismatchError extends MoneyError {
  constructor(
    readonly left: CurrencyCode,
    readonly right: CurrencyCode,
  ) {
    super(
      `Cannot combine ${left} and ${right}. Convert explicitly through the FX service first — ` +
        'implicit conversion would hide the rate and the spread.',
    );
  }
}

/** Thrown when a string or number cannot be interpreted as a monetary amount. */
export class InvalidAmountError extends MoneyError {
  constructor(
    readonly value: unknown,
    reason: string,
  ) {
    super(`Invalid monetary amount ${JSON.stringify(value)}: ${reason}`);
  }
}

/** Thrown when an allocation is asked for an impossible split. */
export class InvalidAllocationError extends MoneyError {
  constructor(reason: string) {
    super(`Cannot allocate: ${reason}`);
  }
}
