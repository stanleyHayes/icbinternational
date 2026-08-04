/**
 * `toEqualMoney(expected)` — compares two money-shaped values by amount and currency.
 *
 * Accepts a `Money` value object, a `MoneyJSON` wire shape, or a hydrated Mongoose
 * subdocument on either side, so a test can compare a repository result straight
 * against a `Money.fromMinor(...)` without serialising anything first.
 */

import { describeMoney, normaliseMoney, type MoneyLike } from './money-like.js';

/** Jest matcher implementation. Registered by `@reliance/testing/jest.setup`. */
export function toEqualMoney(
  this: jest.MatcherContext,
  received: unknown,
  expected: MoneyLike,
): jest.CustomMatcherResult {
  const actual = normaliseMoney(received);
  const wanted = normaliseMoney(expected);

  const pass =
    actual !== null &&
    wanted !== null &&
    actual.amount === wanted.amount &&
    actual.currency === wanted.currency;

  const hint = this.utils.printExpected(describeMoney(expected));
  const got = this.utils.printReceived(describeMoney(received));

  return {
    pass,
    message: () =>
      pass
        ? `expected ${got} not to equal money ${hint}`
        : `expected ${got} to equal money ${hint}`,
  };
}
