/**
 * The numbers the overdraft book runs on.
 *
 * An arranged overdraft is priced daily on what is actually used, not monthly on what is
 * available: a customer who dips fifty pounds into their facility for two days pays for
 * two days of fifty pounds. That is both fairer and simpler to explain, and it is why
 * every rate here is a daily one derived from an annual figure in basis points.
 */

/** Interest on an arranged facility, in basis points a year. 39.9% EAR. */
export const ARRANGED_RATE_BPS = 3990;

/**
 * Interest on the part of a balance beyond the arranged limit.
 *
 * The same rate as the arranged facility, deliberately. Charging more for going over is
 * charging most where the customer can least afford it, and unarranged fees are the single
 * most criticised feature of retail current accounts.
 */
export const UNARRANGED_RATE_BPS = 3990;

/**
 * Buffer below which no interest is charged at all.
 *
 * A customer who goes fifteen pounds overdrawn for a day has made a slip, not taken
 * credit. The buffer costs the bank almost nothing and removes the great majority of
 * complaints about small, surprising charges.
 */
export const INTEREST_FREE_BUFFER_MINOR_UNITS = 2500n;

/** The largest facility the automated path will grant without an underwriter. */
export const MAX_AUTOMATED_LIMIT_MINOR_UNITS = 200_000n;

/** Below this score no facility is offered at all. */
export const MINIMUM_FACILITY_SCORE = 580;

/** Share of monthly income the automated path will lend as a facility, in basis points. */
export const FACILITY_SHARE_OF_INCOME_BPS = 5000n;

/** Facilities are granted in round steps so a customer is never told they have £473. */
export const LIMIT_GRANULARITY_MINOR_UNITS = 5000n;

/** Prefix on every ledger reference the overdraft book writes. */
export const OVERDRAFT_REFERENCE_PREFIX = 'ODR';

/** Mongoose model name for a facility. */
export const OVERDRAFT_MODEL = 'Overdraft';

/** Physical collection holding facilities. */
export const OVERDRAFT_COLLECTION = 'overdrafts';

/** Transaction labels, so a retry log names the operation that produced the conflict. */
export const OVERDRAFT_TRANSACTION_LABEL = {
  REQUEST: 'overdraft.request',
  SUSPEND: 'overdraft.suspend',
  CLOSE: 'overdraft.close',
} as const;
