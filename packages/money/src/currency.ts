/**
 * ISO 4217 currency registry.
 *
 * `exponent` is the number of decimal places the currency subdivides into — it is the
 * only thing that converts between major units (what a customer types) and minor units
 * (what the ledger stores). JPY is 0, USD is 2, KWD is 3. Getting this wrong by one
 * place is a factor-of-ten error in someone's balance, so the table is the single
 * source of truth and nothing else may hardcode `100`.
 */

/** Currencies Reliance Bank can hold, quote or settle in. */
export const CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'JPY',
  'CAD',
  'AUD',
  'NZD',
  'SEK',
  'NOK',
  'DKK',
  'SGD',
  'HKD',
  'AED',
  'SAR',
  'ZAR',
  'NGN',
  'GHS',
  'KES',
  'INR',
  'CNY',
  'BRL',
  'MXN',
  'KWD',
  'BHD',
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface Currency {
  /** ISO 4217 alphabetic code. */
  readonly code: CurrencyCode;
  /** ISO 4217 numeric code. */
  readonly numericCode: string;
  /** Number of minor-unit decimal places. */
  readonly exponent: number;
  /** Display name. */
  readonly name: string;
  /** Symbol used when the locale does not supply one. */
  readonly symbol: string;
}

const CURRENCY_TABLE: Readonly<Record<CurrencyCode, Currency>> = Object.freeze({
  USD: { code: 'USD', numericCode: '840', exponent: 2, name: 'US Dollar', symbol: '$' },
  EUR: { code: 'EUR', numericCode: '978', exponent: 2, name: 'Euro', symbol: '€' },
  GBP: { code: 'GBP', numericCode: '826', exponent: 2, name: 'Pound Sterling', symbol: '£' },
  CHF: { code: 'CHF', numericCode: '756', exponent: 2, name: 'Swiss Franc', symbol: 'CHF' },
  JPY: { code: 'JPY', numericCode: '392', exponent: 0, name: 'Japanese Yen', symbol: '¥' },
  CAD: { code: 'CAD', numericCode: '124', exponent: 2, name: 'Canadian Dollar', symbol: 'CA$' },
  AUD: { code: 'AUD', numericCode: '036', exponent: 2, name: 'Australian Dollar', symbol: 'A$' },
  NZD: { code: 'NZD', numericCode: '554', exponent: 2, name: 'New Zealand Dollar', symbol: 'NZ$' },
  SEK: { code: 'SEK', numericCode: '752', exponent: 2, name: 'Swedish Krona', symbol: 'kr' },
  NOK: { code: 'NOK', numericCode: '578', exponent: 2, name: 'Norwegian Krone', symbol: 'kr' },
  DKK: { code: 'DKK', numericCode: '208', exponent: 2, name: 'Danish Krone', symbol: 'kr' },
  SGD: { code: 'SGD', numericCode: '702', exponent: 2, name: 'Singapore Dollar', symbol: 'S$' },
  HKD: { code: 'HKD', numericCode: '344', exponent: 2, name: 'Hong Kong Dollar', symbol: 'HK$' },
  AED: { code: 'AED', numericCode: '784', exponent: 2, name: 'UAE Dirham', symbol: 'AED' },
  SAR: { code: 'SAR', numericCode: '682', exponent: 2, name: 'Saudi Riyal', symbol: 'SAR' },
  ZAR: { code: 'ZAR', numericCode: '710', exponent: 2, name: 'South African Rand', symbol: 'R' },
  NGN: { code: 'NGN', numericCode: '566', exponent: 2, name: 'Nigerian Naira', symbol: '₦' },
  GHS: { code: 'GHS', numericCode: '936', exponent: 2, name: 'Ghanaian Cedi', symbol: 'GH₵' },
  KES: { code: 'KES', numericCode: '404', exponent: 2, name: 'Kenyan Shilling', symbol: 'KSh' },
  INR: { code: 'INR', numericCode: '356', exponent: 2, name: 'Indian Rupee', symbol: '₹' },
  CNY: { code: 'CNY', numericCode: '156', exponent: 2, name: 'Chinese Yuan', symbol: 'CN¥' },
  BRL: { code: 'BRL', numericCode: '986', exponent: 2, name: 'Brazilian Real', symbol: 'R$' },
  MXN: { code: 'MXN', numericCode: '484', exponent: 2, name: 'Mexican Peso', symbol: 'MX$' },
  KWD: { code: 'KWD', numericCode: '414', exponent: 3, name: 'Kuwaiti Dinar', symbol: 'KD' },
  BHD: { code: 'BHD', numericCode: '048', exponent: 3, name: 'Bahraini Dinar', symbol: 'BD' },
});

/** Every supported currency, in registry order. */
export const CURRENCIES: readonly Currency[] = Object.freeze(Object.values(CURRENCY_TABLE));

/** Narrows an arbitrary string to a supported {@link CurrencyCode}. */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCY_TABLE;
}

/**
 * Looks up currency metadata.
 *
 * @throws {RangeError} when the code is not supported — an unsupported currency must
 *   never silently fall back to a two-decimal default.
 */
export function getCurrency(code: CurrencyCode): Currency {
  const currency = CURRENCY_TABLE[code];
  if (!currency) throw new RangeError(`Unsupported currency code: ${String(code)}`);
  return currency;
}

/** `10 ** exponent` as a bigint — the multiplier between major and minor units. */
export function minorUnitScale(code: CurrencyCode): bigint {
  return 10n ** BigInt(getCurrency(code).exponent);
}
