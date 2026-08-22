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
