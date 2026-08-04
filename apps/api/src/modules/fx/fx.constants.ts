/**
 * Names, windows and pricing constants for foreign exchange.
 *
 * The two numbers that matter most to a customer are here: how long a quoted rate is held
 * (`FX_QUOTE_TTL_SECONDS`) and what the bank charges over the mid-market rate
 * (`SPREAD_BPS`). Both are stated once so the rate on the screen, the rate in the journal
 * entry and the rate in the marketing copy cannot drift apart.
 */

/** Mongoose model name for a held FX price. */
export const FX_QUOTE_MODEL = 'FxQuote';

/** Physical collection holding FX quotes and the conversions that spent them. */
export const FX_QUOTE_COLLECTION = 'fx_quotes';

/** Mongoose model name for a customer's rate alert. */
export const FX_ALERT_MODEL = 'FxAlert';

/** Physical collection holding rate alerts. */
export const FX_ALERT_COLLECTION = 'fx_alerts';

/**
 * How long a quoted rate is honoured, in seconds.
 *
 * Ninety seconds is long enough to read the figures and press the button, and short enough
 * that the bank is not writing a free option on a moving market. Past it the customer is
 * re-quoted rather than repriced silently — see `FxExecutionService`.
 */
export const FX_QUOTE_TTL_SECONDS = 90;

/** Days a spent or lapsed quote is kept before Mongo's TTL index reaps it. */
export const FX_QUOTE_RETENTION_DAYS = 30;

/** Prefix on the journal reference of every conversion, derived from the quote id. */
export const FX_CONVERSION_REFERENCE_PREFIX = 'fx:';

/** Narrative shown on both wallet statements for a conversion. */
export const FX_CONVERSION_DESCRIPTION = 'Currency exchange';

/** Job name for the rate-alert sweep. */
export const FX_ALERT_JOB = 'fx.alerts.evaluate';

/** Alerts examined in one sweep. Bounded so one customer cannot starve the queue. */
export const FX_ALERT_BATCH = 200;

/** Interval between rate-alert sweeps, in milliseconds. */
export const FX_ALERT_INTERVAL_MS = 60_000;

/** Basis-point denominator. */
export const BPS_DENOMINATOR = 10_000;

/** Milliseconds in one second, for TTL arithmetic. */
export const MS_PER_SECOND = 1_000;
