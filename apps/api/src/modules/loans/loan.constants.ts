/**
 * The numbers the lending book runs on.
 *
 * Every rate is an integer count of basis points and every scaling factor is a `bigint`,
 * so no percentage in this module is ever a float. The fixed-point `RATE_SCALE` is what
 * lets a 480-month mortgage compound without drifting: at 18 decimal places the error
 * accumulated over the longest term the contract permits is far below one minor unit.
 */

/** Basis points in one hundred percent. 10 000 bps = 100%. */
export const BPS_SCALE = 10_000n;

/** Instalment periods in a year. Every product in the catalogue bills monthly. */
export const MONTHS_PER_YEAR = 12n;

/** Day-count basis for daily accrual: actual/365, the sterling market convention. */
export const DAYS_PER_YEAR = 365n;

/**
 * Decimal places the periodic-rate arithmetic carries.
 *
 * Eighteen, because a 480-period compounding divides back to scale on every step and the
 * accumulated truncation has to stay orders of magnitude below one minor unit.
 */
const RATE_DECIMAL_PLACES = 18n;

/** Fixed-point denominator for periodic-rate arithmetic. */
export const RATE_SCALE = 10n ** RATE_DECIMAL_PLACES;

/** Longest term the contract accepts, and therefore the longest schedule we will build. */
export const MAX_TERM_MONTHS = 480;

/** Days an indicative offer stands before it has to be re-quoted against fresh data. */
export const OFFER_VALIDITY_DAYS = 30;

/** Minutes a settlement figure is guaranteed for, after which interest has moved on. */
export const PAYOFF_QUOTE_VALIDITY_MINUTES = 60;

/** Days after a due date before the instalment is treated as missed and a fee applies. */
export const ARREARS_GRACE_DAYS = 5;

/** Charged once per missed instalment, in minor units of the loan currency. */
export const LATE_FEE_MINOR_UNITS = 1200n;

/** Days past due at which the bank stops recognising interest and calls the loan. */
export const DEFAULT_THRESHOLD_DAYS = 90;

/** Score below which no application is auto-approved, whatever the product. */
export const MINIMUM_LENDABLE_SCORE = 560;

/** Score at or above which an application may be approved without a human. */
export const AUTO_APPROVE_SCORE = 700;

/** Debt-to-income above which the bank will not lend at all, in basis points. */
export const MAXIMUM_DEBT_TO_INCOME_BPS = 6000;

/** Debt-to-income above which an application always goes to an underwriter. */
export const REFERRAL_DEBT_TO_INCOME_BPS = 4000;

/** Share of disposable income the bank will let a new instalment consume, in bps. */
export const MAX_INSTALMENT_SHARE_BPS = 3500n;

/** Lowest and highest values the scorecard can produce, per the contract. */
export const MIN_CREDIT_SCORE = 300;
export const MAX_CREDIT_SCORE = 850;

/** Where the scorecard starts before any of the customer's own history is applied. */
export const BASE_CREDIT_SCORE = 520;

/** Prefix on every ledger reference this module books, so entries are traceable by eye. */
export const LOAN_REFERENCE_PREFIX = 'LOAN';

/**
 * How many times a repayment re-reads the loan after losing a race, before giving up.
 *
 * A loss means another repayment committed between this one's read and its write, so the
 * figures have to be recomputed against the new balance. Five is generous for a single
 * loan: contention beyond that is not a race, it is a client in a loop, and answering
 * `CONFLICT` is better than spinning.
 */
export const MAX_REPAYMENT_ATTEMPTS = 5;

/** Transaction labels, so a retry in the logs names the operation that was retried. */
export const LOAN_TRANSACTION_LABEL = {
  REPAY: 'loan.repay',
  DRAWDOWN: 'loan.drawdown',
} as const;
