/**
 * Parsing of human-entered amounts into minor units.
 *
 * Deliberately string-in / bigint-out. There is no `parseFloat` anywhere in this file,
 * because the moment an amount becomes a JavaScript number it has already lost the
 * precision we are trying to protect.
 */

import { getCurrency, type CurrencyCode } from './currency.js';
import { InvalidAmountError } from './money.errors.js';

/** Sign, integer part with optional thousands grouping, optional fractional part. */
const MAJOR_AMOUNT_PATTERN = /^[+-]?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?$/;

const GROUPING_SEPARATOR = ',';
const DECIMAL_SEPARATOR = '.';
const NOT_FOUND = -1;

/** Validates the input and returns it trimmed, ready to be sliced apart. */
function assertParsable(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidAmountError(value, 'empty string');

  if (!MAJOR_AMOUNT_PATTERN.test(trimmed)) {
    throw new InvalidAmountError(
      value,
      'expected a decimal amount such as "1234.56" or "1,234.56"',
    );
  }
  return trimmed;
}

interface AmountParts {
  readonly negative: boolean;
  readonly integerDigits: string;
  readonly fractionDigits: string;
}

function splitAmount(trimmed: string): AmountParts {
  const negative = trimmed.startsWith('-');
  const signed = negative || trimmed.startsWith('+');
  const unsigned = signed ? trimmed.slice(1) : trimmed;

  const separatorAt = unsigned.indexOf(DECIMAL_SEPARATOR);
  const whole = separatorAt === NOT_FOUND ? unsigned : unsigned.slice(0, separatorAt);

  return {
    negative,
    integerDigits: whole.replaceAll(GROUPING_SEPARATOR, ''),
    fractionDigits: separatorAt === NOT_FOUND ? '' : unsigned.slice(separatorAt + 1),
  };
}

/**
 * Converts a major-unit decimal string into minor units.
 *
 * Rejects — rather than silently rounds — an amount with more decimal places than the
 * currency supports. `"10.005"` in USD is almost always a bug in the caller, and
 * quietly turning it into `1000` or `1001` cents hides that bug in a ledger.
 *
 * @example
 * parseMajorToMinor('1,234.56', 'USD'); // 123456n
 * parseMajorToMinor('1234',     'JPY'); // 1234n
 */
export function parseMajorToMinor(value: string, currency: CurrencyCode): bigint {
  const { exponent } = getCurrency(currency);
  const { negative, integerDigits, fractionDigits } = splitAmount(assertParsable(value));

  if (fractionDigits.length > exponent) {
    throw new InvalidAmountError(
      value,
      `${currency} supports ${exponent} decimal place(s), received ${fractionDigits.length}`,
    );
  }

  const minor = BigInt(`${integerDigits}${fractionDigits.padEnd(exponent, '0')}`);
  return negative ? -minor : minor;
}

/**
 * Converts minor units back to a plain major-unit decimal string.
 *
 * Unlike {@link import('./format.js').formatMinor} this applies no locale, grouping or
 * symbol — it is the canonical machine representation used in exports, receipts and
 * anywhere a value must round-trip through {@link parseMajorToMinor} unchanged.
 */
export function formatMinorToMajor(minor: bigint, currency: CurrencyCode): string {
  const { exponent } = getCurrency(currency);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(exponent + 1, '0');

  const sign = negative ? '-' : '';
  if (exponent === 0) return `${sign}${digits}`;

  const boundary = digits.length - exponent;
  return `${sign}${digits.slice(0, boundary)}.${digits.slice(boundary)}`;
}
