/**
 * Names and thresholds shared across the holds module.
 *
 * A model name couples the schema, the repository and the module registration; keeping
 * the three literals as one constant removes two chances for them to disagree.
 */

/** Mongoose model name for a hold. */
export const HOLD_MODEL = 'Hold';

/** Physical collection holding authorisations and liens. */
export const HOLD_COLLECTION = 'holds';

/** Transaction labels, so a retry-conflict log names the operation that caused it. */
export const HOLD_TRANSACTION_LABEL = {
  PLACE: 'holds.place',
  RELEASE: 'holds.release',
  CAPTURE: 'holds.capture',
  EXPIRE: 'holds.expire',
} as const;

/**
 * How many expired holds one sweep resolves.
 *
 * Each is released in its own transaction, so a bounded batch keeps the job's runtime
 * predictable and makes partial progress a normal, safe outcome rather than a failure.
 */
export const HOLD_EXPIRY_BATCH = 250;

/** Prefix on the journal reference a capture books, so a statement names its origin. */
export const CAPTURE_REFERENCE_PREFIX = 'CAP-';
