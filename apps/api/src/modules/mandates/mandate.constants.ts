/**
 * Names, windows and copy for direct-debit mandates.
 *
 * The Direct Debit Guarantee is the reason several of these numbers are generous. A customer
 * who says a collection was wrong gets their money back immediately and in full, and the
 * bank argues with the merchant afterwards — so the dispute window is long, the refund is
 * unconditional, and neither is a setting an operator can quietly tighten.
 */

/** Mongoose model name for a direct-debit mandate. */
export const MANDATE_MODEL = 'Mandate';

/** Physical collection holding mandates and their collection history. */
export const MANDATE_COLLECTION_NAME = 'mandates';

/** Job name for the collection sweep. */
export const MANDATE_COLLECTION_JOB = 'mandates.collect';

/** Interval between collection sweeps, in milliseconds. Hourly is finer than any schedule. */
export const MANDATE_SWEEP_INTERVAL_MS = 3_600_000;

/** Mandates collected in one sweep. */
export const MANDATE_SWEEP_BATCH = 200;

/** Collections retained on the mandate document. Three years of monthly collections. */
export const RETAINED_COLLECTIONS = 36;

/** Journal reference prefixes. Derived from the entry's own identity, so each is unique. */
export const COLLECTION_REFERENCE_PREFIX = 'dd:';
export const COLLECTION_SETTLEMENT_PREFIX = 'dd-settle:';
export const GUARANTEE_REFUND_PREFIX = 'dd-refund:';

/** Narrative on a guarantee refund. Customers recognise the phrase from the scheme rules. */
export const GUARANTEE_REFUND_DESCRIPTION = 'Direct Debit Guarantee refund';

/**
 * How long after a collection a customer may claim under the guarantee.
 *
 * Thirteen months. That is the scheme's own indemnity window, and shortening it to something
 * more convenient for the bank would be quietly withdrawing a protection the customer was
 * told they had.
 */
export const GUARANTEE_WINDOW_DAYS = 396;

/** Milliseconds in a day. */
export const MS_PER_DAY = 86_400_000;

/** Notice a merchant must give before collecting, in days. Scheme rules, not preference. */
export const ADVANCE_NOTICE_DAYS = 3;

/** How often a merchant may collect. Free text on the wire; these are the ones we schedule. */
export const MandateFrequency = {
  WEEKLY: 'WEEKLY',
  FORTNIGHTLY: 'FORTNIGHTLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUALLY: 'ANNUALLY',
  /** Collected when the merchant asks, with no schedule of its own. */
  VARIABLE: 'VARIABLE',
} as const;
export type MandateFrequency = (typeof MandateFrequency)[keyof typeof MandateFrequency];

/** Days between collections, per frequency. `VARIABLE` has no next date to compute. */
export const FREQUENCY_DAYS: Readonly<Record<MandateFrequency, number | null>> = Object.freeze({
  WEEKLY: 7,
  FORTNIGHTLY: 14,
  MONTHLY: 30,
  QUARTERLY: 91,
  ANNUALLY: 365,
  VARIABLE: null,
});
