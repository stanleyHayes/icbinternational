import { type Money, type CurrencyCode } from '@reliance/money';

/**
 * One currency the customer holds, and what it is worth in the currency they think in.
 *
 * The wallet's own figures are exact — they are the account's balances, untouched. Only
 * `baseEquivalent` involves a rate, and it is nullable rather than optimistic: a wallet the
 * bank cannot price is shown at its true balance with the conversion left blank, which is
 * honest, instead of at zero, which is a lie the customer would not notice.
 */
export interface WalletPosition {
  readonly accountId: string;
  readonly currency: CurrencyCode;
  /** The customer's own label for the wallet, or the product's name. */
  readonly name: string;
  /** Booked balance. What has been posted. */
  readonly ledger: Money;
  /** Spendable now: booked, less holds, plus any facility. */
  readonly available: Money;
  /** The booked balance in the customer's base currency, or null when unpriceable. */
  readonly baseEquivalent: Money | null;
  /** Mid-market rate used for the conversion, as a decimal string. */
  readonly rate: string | null;
}

/**
 * Every wallet the customer holds, and the one number they came for.
 *
 * Assets and liabilities are classified **per account**, not per currency. A customer with
 * £1,200 in one wallet and £200 overdrawn in another has assets of £1,200 and liabilities
 * of £200; netting them to a single £1,000 asset first would hide the borrowing, which is
 * the figure a lender — and the customer — most wants to see.
 */
export interface WalletOverview {
  readonly baseCurrency: CurrencyCode;
  readonly positions: readonly WalletPosition[];
  readonly totalAssets: Money;
  readonly totalLiabilities: Money;
  /** Assets less liabilities, in the base currency. */
  readonly net: Money;
  /** Totals per currency, exact, because no conversion is involved in them. */
  readonly byCurrency: readonly { readonly currency: CurrencyCode; readonly total: Money }[];
  /** Currencies excluded from the totals because no rate was available. */
  readonly unpriced: readonly CurrencyCode[];
  readonly asOf: Date;
}
