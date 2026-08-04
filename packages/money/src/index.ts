/**
 * `@reliance/money` — the only place in Reliance Bank where monetary arithmetic happens.
 *
 * Amounts are signed `bigint` minor units paired with an ISO 4217 currency. Floats are
 * banned by lint rule; combining currencies throws; every rounding decision is explicit.
 *
 * @example
 * const salary = Money.fromMajor('4,250.00', 'GBP');
 * const [rent, food, savings] = salary.allocate([50, 30, 20]);
 * rent.plus(food).plus(savings).equals(salary); // always true
 */

export {
  CURRENCIES,
  CURRENCY_CODES,
  getCurrency,
  isCurrencyCode,
  minorUnitScale,
  type Currency,
  type CurrencyCode,
} from './currency.js';

export { Money, sumMoney, type MoneyJSON } from './money.js';

export {
  CurrencyMismatchError,
  InvalidAllocationError,
  InvalidAmountError,
  MoneyError,
} from './money.errors.js';

export { allocateMinor, splitMinor } from './allocate.js';

export { formatMinorToMajor, parseMajorToMinor } from './parse.js';

export {
  accountingFormat,
  formatMinor,
  type CurrencyDisplay,
  type FormatOptions,
} from './format.js';

export { DEFAULT_ROUNDING, divideWithRounding, RoundingMode } from './rounding.js';

export {
  applySpread,
  convert,
  formatRate,
  invertRate,
  rateFromDecimalString,
  RATE_SCALE,
  type ExchangeRate,
} from './exchange.js';
