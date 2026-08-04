/**
 * Names and thresholds shared across the beneficiaries module.
 *
 * A model name is a coupling point — the schema declares it, the repository injects it
 * and the module registers it — so it is spelled once here rather than three times.
 */

/** Mongoose model name for a saved payee. */
export const BENEFICIARY_MODEL = 'Beneficiary';

/** Physical collection holding saved payees. */
export const BENEFICIARY_COLLECTION = 'beneficiaries';

/**
 * How long a newly saved payee is held before large payments are allowed.
 *
 * Twenty-four hours is the industry convention, and the reason is social rather than
 * technical: authorised-push-payment fraud works by hurrying somebody. A day between
 * adding an account and being able to send it real money is the cheapest intervention
 * that exists, because it gives the customer a night's sleep and the bank a window to
 * notice a pattern.
 */
export const COOLING_OFF_HOURS = 24;

/**
 * The most that may be sent to an untrusted payee, in major units of the payment currency.
 *
 * Expressed in major units and parsed against the transfer's own currency so the figure
 * means the same thing in a two-decimal currency and a zero-decimal one — a hard-coded
 * minor-unit ceiling would be a hundred times stricter in JPY than in GBP.
 *
 * A per-currency, per-segment table belongs in the product catalogue rather than here;
 * see `docs/HANDOFFS.md`.
 */
export const COOLING_OFF_THRESHOLD_MAJOR = '1000';

/**
 * Payments at or above this figure require a fresh step-up, trusted payee or not.
 *
 * Cooling-off protects against a *new* destination; this protects against a large one, and
 * the two catch different frauds — a compromised session paying an old, trusted payee is
 * caught only by the second.
 */
export const STEP_UP_THRESHOLD_MAJOR = '2500';

/** Transaction labels, so a retry log names the operation that produced the conflict. */
export const BENEFICIARY_TRANSACTION_LABEL = {
  CREATE: 'beneficiary.create',
  UPDATE: 'beneficiary.update',
} as const;

/** ISO 4217 alphabetic codes are three characters. */
export const CURRENCY_CODE_LENGTH = 3;

/** Ceiling on how many saved payees one customer may hold. */
export const MAX_BENEFICIARIES_PER_CUSTOMER = 500;
