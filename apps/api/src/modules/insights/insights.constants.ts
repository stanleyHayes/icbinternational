/**
 * Thresholds and names shared across the insights module.
 *
 * Every number here encodes a product judgement, not a technical limit, so each carries
 * the reasoning: a threshold nobody can justify is a threshold nobody dares change.
 */

/** Mongoose model name for a customer budget. */
export const BUDGET_MODEL = 'Budget';

/** Physical collection holding customer budgets. */
export const BUDGET_COLLECTION = 'budgets';

/**
 * One hundred percent, in basis points.
 *
 * Shares reach the client as integers because a percentage that arrives as `33.33333`
 * cannot be summed back to a whole by any client, and a float that represents a share of
 * someone's money is the same mistake as a float that represents the money.
 */
export const BASIS_POINTS_SCALE = 10_000;

/**
 * How many charges before a repeating payment is called a subscription.
 *
 * Two charges is a coincidence — a customer who bought coffee at the same place last
 * month and this month has not subscribed to anything. Three establishes a cadence and
 * lets the interval between them be checked for consistency, which two cannot.
 */
export const MIN_SUBSCRIPTION_CHARGES = 3;

/**
 * How far each charge may stray from the median before the series stops being a
 * subscription, in basis points.
 *
 * Five percent absorbs the real variation in genuine recurring charges — a usage-based
 * utility bill, VAT rounding, a currency-converted foreign subscription — without
 * admitting a merchant the customer simply visits often at varying amounts.
 */
export const SUBSCRIPTION_AMOUNT_TOLERANCE_BPS = 500;

/**
 * How far the gap between charges may stray from a nominal cadence, in days.
 *
 * Monthly billing is not 30 days: it lands on the same date each month, which is 28 to 31
 * days apart, and a weekend or a bank holiday moves a direct debit by another day or two.
 * Anything tighter than this rejects most real monthly subscriptions.
 */
export const CADENCE_TOLERANCE_DAYS = 5;

/** Nominal gap in days for each cadence the contract recognises. */
export const CADENCE_DAYS = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 91,
  ANNUAL: 365,
} as const;

export const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * How far back subscription detection looks when the caller does not say.
 *
 * A year contains at least three charges of any weekly, monthly or quarterly
 * subscription, which is the detection threshold. Annual ones need three years and the
 * caller has to ask for them explicitly.
 */
export const DEFAULT_SUBSCRIPTION_LOOKBACK_DAYS = 365;
