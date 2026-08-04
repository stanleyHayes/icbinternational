/**
 * Constants for the disputes module.
 *
 * The day counts are the scheme clock the contract describes to the customer: the
 * merchant has thirty days to answer, and the bank owes a decision inside sixty. They
 * are simulated-clock days — advancing the simulator moves every deadline with it.
 */

/** Mongoose model token. */
export const DISPUTE_MODEL = 'Dispute';

/** MongoDB collection — matches plan §3.3 (`transactionId` unique, `status` indexed). */
export const DISPUTE_COLLECTION = 'disputes';

/**
 * How far back a transaction can be disputed, in days.
 *
 * Card schemes allow roughly 120 days from the transaction for most reason codes; past
 * that the answer is `DISPUTE_WINDOW_CLOSED`, not a silent acceptance.
 */
export const DISPUTE_WINDOW_DAYS = 120;

/** Days the merchant has to respond before their answer is simulated as due. */
export const MERCHANT_RESPONSE_DAYS = 30;

/** Days from raising to the regulatory decision deadline shown to the customer. */
export const DECISION_DUE_DAYS = 60;

/** Total evidence items a dispute may carry, per the contract's create schema. */
export const MAX_EVIDENCE_IDS = 10;

/**
 * How often the simulated merchant contests rather than accepts liability, in percent.
 * Deterministic per dispute — see the merchant-response port.
 */
export const MERCHANT_CONTEST_RATE_PERCENT = 70;

/** Ledger reference prefix for a provisional-credit entry. Unique per dispute. */
export const PROVISIONAL_CREDIT_REFERENCE_PREFIX = 'DSP-PC-';

/** Ledger reference prefix for a won-dispute resolution entry. */
export const RESOLUTION_REFERENCE_PREFIX = 'DSP-RS-';

/** Audit trail entity family. */
export const DISPUTE_AUDIT_ENTITY = 'dispute';

/** The fields the audit trail keeps on a dispute — status, money and outcome only. */
export const DISPUTE_AUDIT_CAPTURE_FIELDS = Object.freeze([
  'id',
  'transactionId',
  'status',
  'reason',
  'disputedAmount',
  'provisionalCredit',
  'outcomeSummary',
  'resolvedAt',
]);

/** Locale used when rendering dates and amounts for customer notifications. */
export const NOTIFICATION_LOCALE = 'en-GB';
