/**
 * The boundary where a monetary amount enters the UI.
 *
 * Every money value crossing into a component arrives as a *string of minor units* — the same
 * representation the API and the ledger use (`MoneyJSON.amount`). This module is the only place
 * that string is turned into a number-like value, and it turns it into a `bigint`.
 *
 * A React prop is untyped at runtime: `<MoneyText amount={12.5 as never} />` compiles in an app
 * with a loose fetch layer, and `12.5` minor units is not an amount that exists. So the check is
 * a runtime one, and it throws rather than coercing. A component that silently rounds a
 * malformed amount to `13` has invented a penny in a bank's user interface.
 */

/** Optional sign, then digits. No decimal point: minor units are whole by definition. */
const MINOR_UNITS_PATTERN = /^-?\d+$/;

/** Thrown when an amount reaches a component in a form that is not integer minor units. */
export class InvalidMinorUnitsError extends TypeError {
  constructor(received: unknown) {
    super(
      `Expected an integer minor-unit string such as "123456" or "-500", received ` +
        `${typeof received} ${JSON.stringify(received)}. Money never crosses a component ` +
        `boundary as a float — pass Money#amount.toString() or MoneyJSON.amount.`,
    );
    this.name = 'InvalidMinorUnitsError';
  }
}

/**
 * Parses minor units, rejecting anything that is not an integer string.
 *
 * Numbers are rejected even when integral: accepting `1234` would make `12.34` a one-character
 * typo away from being accepted too, and the whole point is that the type of a money amount in
 * this codebase is never `number`.
 *
 * @throws {InvalidMinorUnitsError} if the value is not `/^-?\d+$/`.
 */
export function toMinorUnits(value: string): bigint {
  if (typeof value !== 'string' || !MINOR_UNITS_PATTERN.test(value)) {
    throw new InvalidMinorUnitsError(value);
  }
  return BigInt(value);
}

/** True when the value is a well-formed minor-unit string. */
export function isMinorUnits(value: unknown): value is string {
  return typeof value === 'string' && MINOR_UNITS_PATTERN.test(value);
}

/** Strips everything that is not a digit — the raw keystrokes behind an amount field. */
export function digitsOnly(value: string): string {
  return value.replaceAll(/\D/g, '');
}
