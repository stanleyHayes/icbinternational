import { rateFromDecimalString, type CurrencyCode, type ExchangeRate } from '@reliance/money';

/**
 * The anchors the simulated market walks around.
 *
 * Every rate in the bank is expressed against sterling, because the book is kept in
 * sterling and a single spoke currency means one anchor per currency instead of one per
 * pair. A cross such as EUR/JPY is derived from the two sterling legs, exactly as a real
 * treasury desk derives it — which also means a cross can never disagree with the two
 * legs it is made of.
 *
 * These are plausible mid-market levels, not live prices. The feed moves them; nothing in
 * the bank reads this table directly except the feed's initialisation.
 */

/** The currency every anchor is quoted against. */
export const PIVOT_CURRENCY: CurrencyCode = 'GBP';

/** Units of each currency per one pound, as decimal strings. */
const ANCHOR_PER_GBP: Readonly<Record<CurrencyCode, string>> = Object.freeze({
  GBP: '1',
  USD: '1.2740',
  EUR: '1.1685',
  CHF: '1.0940',
  JPY: '192.4000',
  CAD: '1.7180',
  AUD: '1.9420',
  NZD: '2.0910',
  SEK: '13.2400',
  NOK: '13.6100',
  DKK: '8.7180',
  SGD: '1.6890',
  HKD: '9.8760',
  AED: '4.6790',
  SAR: '4.7780',
  ZAR: '23.1400',
  NGN: '1980.0000',
  GHS: '15.4200',
  KES: '164.3000',
  INR: '106.4800',
  CNY: '9.0450',
  BRL: '6.9530',
  MXN: '22.0800',
  KWD: '0.3902',
  BHD: '0.4802',
});

/** The starting mid for `GBP → code`. */
export function anchorFor(code: CurrencyCode): ExchangeRate {
  const decimal = ANCHOR_PER_GBP[code];
  if (!decimal) {
    throw new RangeError(`No sterling anchor is defined for ${code}`);
  }

  return rateFromDecimalString(PIVOT_CURRENCY, code, decimal);
}

/** Every currency the feed can quote. */
export const QUOTABLE_CURRENCIES: readonly CurrencyCode[] = Object.freeze(
  Object.keys(ANCHOR_PER_GBP) as CurrencyCode[],
);

/** Whether the feed holds an anchor for a currency. */
export function isQuotable(code: string): code is CurrencyCode {
  return Object.hasOwn(ANCHOR_PER_GBP, code);
}
