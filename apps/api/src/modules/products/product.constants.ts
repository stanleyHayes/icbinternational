/**
 * Constants shared by the product catalogue, its pricing and its limits.
 *
 * Collection names live here rather than in the schema files because the seed layer
 * writes to the same collections without importing the Mongoose models, and two spellings
 * of `products` would be two collections that both look right in isolation.
 */

/** 10 000 basis points is 100%. Every rate in the catalogue is quoted in bps. */
export const BASIS_POINTS_DENOMINATOR = 10_000n;

/** Collection holding every version of every product. Versions are never deleted. */
export const PRODUCTS_COLLECTION = 'products';

/** Collection holding rolling limit and fee-allowance counters. */
export const USAGE_COUNTERS_COLLECTION = 'usage_counters';

/** Characters in an ISO calendar date, `YYYY-MM-DD`. */
export const ISO_DATE_LENGTH = 10;

/**
 * Days a spent counter is kept past its reset instant.
 *
 * A counter is meaningless once its window has rolled, but support fields "why was my
 * card declined yesterday?" calls, and answering that needs the counter that caused it.
 * A week is long enough for the call and short enough that the collection stays small.
 */
export const COUNTER_RETENTION_DAYS = 7;

/** Used when a customer has expressed no timezone preference. Reliance Bank is UK-based. */
export const DEFAULT_TIME_ZONE = 'Europe/London';

/** Digits in a four-digit year, for zero-padding a period key. */
export const YEAR_DIGITS = 4;

/** Digits in a zero-padded month, day, hour or minute. */
export const TWO_DIGITS = 2;

/** The first version number a newly created product receives. */
export const FIRST_PRODUCT_VERSION = 1;
