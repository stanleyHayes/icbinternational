/**
 * Locale-aware display formatting.
 *
 * `Intl.NumberFormat#format` accepts a decimal *string* and formats it at arbitrary
 * precision, which lets us render a bigint amount without ever materialising it as a
 * JavaScript number. That is the whole trick, and it is why nothing here converts.
 */

import { getCurrency, type CurrencyCode } from './currency.js';
import { formatMinorToMajor } from './parse.js';

export type CurrencyDisplay = 'symbol' | 'narrowSymbol' | 'code' | 'name' | 'none';

export interface FormatOptions {
  /** BCP 47 locale tag. Defaults to `en-US`. */
  readonly locale?: string;
  /** How to render the currency. `'none'` emits digits only. */
  readonly display?: CurrencyDisplay;
  /** Force a leading `+` on positive amounts — used for credits in transaction lists. */
  readonly signDisplay?: Intl.NumberFormatOptions['signDisplay'];
  /** Thousands grouping. Defaults to on. */
  readonly useGrouping?: boolean;
  /** Render as a compact figure (`$1.2K`) — dashboards only, never statements. */
  readonly compact?: boolean;
}

const DEFAULT_LOCALE = 'en-US';

function buildIntlOptions(
  currency: CurrencyCode,
  options: FormatOptions,
): Intl.NumberFormatOptions {
  const { exponent } = getCurrency(currency);
  const { display = 'symbol', signDisplay = 'auto', useGrouping = true, compact = false } = options;

  const base: Intl.NumberFormatOptions = {
    minimumFractionDigits: compact ? 0 : exponent,
    maximumFractionDigits: exponent,
    signDisplay,
    useGrouping,
    ...(compact ? { notation: 'compact' as const, compactDisplay: 'short' as const } : {}),
  };

  if (display === 'none') return { ...base, style: 'decimal' };

  return { ...base, style: 'currency', currency, currencyDisplay: display };
}

/**
 * Formats a minor-unit amount for display.
 *
 * @example
 * formatMinor(123456n, 'USD');                          // "$1,234.56"
 * formatMinor(123456n, 'USD', { display: 'none' });     // "1,234.56"
 * formatMinor(-500n,   'EUR', { locale: 'de-DE' });     // "-5,00 €"
 */
export function formatMinor(
  minor: bigint,
  currency: CurrencyCode,
  options: FormatOptions = {},
): string {
  const { locale = DEFAULT_LOCALE } = options;

  // `formatMinorToMajor` emits a bare decimal literal by construction. TypeScript cannot
  // infer the `${number}` template-literal type through string concatenation, so the
  // narrowing is asserted once, here, rather than weakening the signature everywhere.
  const major = formatMinorToMajor(minor, currency) as Intl.StringNumericLiteral;

  return new Intl.NumberFormat(locale, buildIntlOptions(currency, options)).format(major);
}

/**
 * Formats an amount for accounting contexts, where negatives are parenthesised rather
 * than signed. Used in statements, the trial balance and finance exports.
 *
 * @example accountingFormat(-123456n, 'USD') // "($1,234.56)"
 */
export function accountingFormat(
  minor: bigint,
  currency: CurrencyCode,
  options: FormatOptions = {},
): string {
  const magnitude = formatMinor(minor < 0n ? -minor : minor, currency, options);
  return minor < 0n ? `(${magnitude})` : magnitude;
}
