/**
 * The numbers and names the interest engine runs on.
 *
 * Two things here are load-bearing. `ACCRUAL_BATCH_SIZE` bounds one pass over the book,
 * so a nightly run makes progress even if it dies halfway, and the job names are the
 * contract the simulation control room enqueues under — changing one without telling the
 * scheduler strands jobs on the queue with no consumer.
 */

/** Mongo collection holding per-account accrual state. */
export const ACCRUAL_STATE_COLLECTION = 'interest_accruals';

/** Model token the state repository injects. */
export const ACCRUAL_STATE_MODEL = 'InterestAccrualState';

/** Accounts one accrual or capitalisation pass processes per page. */
export const ACCRUAL_BATCH_SIZE = 500;

/** Prefix on every ledger reference the interest engine writes. */
export const INTEREST_REFERENCE_PREFIX = 'INT';

/** Separator between the segments of a ledger reference. */
export const REFERENCE_SEGMENT = '-';

/** BullMQ job name for the daily accrual run, on the `scheduler` queue. */
export const DAILY_ACCRUAL_JOB = 'interest.daily-accrual';

/** BullMQ job name for the monthly capitalisation run, on the `scheduler` queue. */
export const MONTHLY_CAPITALISATION_JOB = 'interest.monthly-capitalisation';

/**
 * Model token for the read-only view over the accounts collection.
 *
 * A distinct name over the accounts lane's own schema — the same trick the devices lane
 * uses for sessions — so this module never collides with the lane's own model
 * registration, however the two modules happen to load.
 */
export const INTEREST_ACCOUNT_VIEW_MODEL = 'InterestAccountView';
