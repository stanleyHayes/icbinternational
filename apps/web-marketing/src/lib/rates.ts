import type { InterestTier, Money, ProductRates } from '@reliance/contracts';

/**
 * Picking the one rate a page leads with.
 *
 * `Math.max()` with no arguments is `-Infinity` and `Math.min()` with none is `Infinity`.
 * Spreading an empty array into either produces one of those silently, and it is still a
 * `number`, so it passes every type check between here and the screen — arriving as
 * `-Infinity.NaN% AER` in the hero of a bank's home page.
 *
 * The list is empty precisely when the build could not reach the bank: `withFallback` in
 * `lib/api/public-data.ts` swallows the error during a production build and returns
 * `FALLBACK_RATES`, whose `savings` and `lending` are both `[]`. That is the moment a
 * marketing page must say nothing at all rather than quote a number no one published.
 *
 * Returning `null` makes "we have no rate to quote" a state the caller has to handle,
 * which is the only reason it cannot be forgotten again.
 */

/** The highest rate in a published list, or `null` when nothing was published. */
export function highestRateBps(basisPoints: readonly number[]): number | null {
  return basisPoints.length > 0 ? Math.max(...basisPoints) : null;
}

/** The lowest rate in a published list, or `null` when nothing was published. */
export function lowestRateBps(basisPoints: readonly number[]): number | null {
  return basisPoints.length > 0 ? Math.min(...basisPoints) : null;
}

/**
 * Turning the published catalogue into the rows a rate table prints.
 *
 * `/public/rates` answers with one entry per product — the credit bands it pays and the
 * arranged-overdraft rate it charges. The tables want a flat row each, so the shaping
 * happens here rather than inside a component, where it would be duplicated between the
 * savings page and the combined rates-and-fees page and would drift.
 */

/** One product's best credit rate, and the balance you need to earn it. */
export interface SavingsRateRow {
  readonly code: string;
  readonly name: string;
  readonly annualRateBps: number;
  readonly minBalance: Money;
}

/** One product's arranged-overdraft rate. */
export interface OverdraftRateRow {
  readonly code: string;
  readonly name: string;
  readonly annualRateBps: number;
}

/**
 * The savings side, one row per product that pays interest.
 *
 * A product pays in bands, so the row quotes the best band and the balance it starts at —
 * the phrasing the admin console already uses ("top rate on this product, on balances
 * from X"). Quoting the entry band instead would understate what the account pays; quoting
 * the top band without its threshold would overstate what most balances earn.
 */
export function savingsRows(rates: readonly ProductRates[]): readonly SavingsRateRow[] {
  return rates.flatMap((product) => {
    const best = product.creditInterestTiers.reduce<InterestTier | null>(
      (top, tier) => (top === null || tier.annualRateBps > top.annualRateBps ? tier : top),
      null,
    );

    if (best === null) return [];
    return [
      {
        code: product.code,
        name: product.name,
        annualRateBps: best.annualRateBps,
        minBalance: best.fromAmount,
      },
    ];
  });
}

/** The borrowing side, one row per product that can go overdrawn. */
export function overdraftRows(rates: readonly ProductRates[]): readonly OverdraftRateRow[] {
  return rates.flatMap((product) =>
    product.debitInterestBps === null
      ? []
      : [{ code: product.code, name: product.name, annualRateBps: product.debitInterestBps }],
  );
}

/**
 * The most recent date any of these rates took effect, or `null` when there are none.
 *
 * A rate table has to print the date its figures came into force. Products are versioned
 * independently, so the honest single date for a table of several is the latest of them:
 * every row shown was in force on it.
 */
export function latestEffectiveFrom(rates: readonly ProductRates[]): string | null {
  return rates.reduce<string | null>(
    (latest, product) =>
      latest === null || product.effectiveFrom > latest ? product.effectiveFrom : latest,
    null,
  );
}
