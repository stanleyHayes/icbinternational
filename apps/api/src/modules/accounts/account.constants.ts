/**
 * Names, tokens and thresholds shared across the accounts module.
 *
 * They live in one file because each is a coupling point: a model name is declared by the
 * schema, injected by the repository and registered by the module, and three literals
 * that must agree are three chances to disagree.
 */

/** Mongoose model name for a customer account. */
export const ACCOUNT_MODEL = 'Account';

/** Physical collection holding customer accounts. */
export const ACCOUNT_COLLECTION = 'accounts';

/**
 * Injection token for the bank's own identifiers.
 *
 * A token rather than `AppConfigService` directly, so a unit test states the three values
 * it cares about instead of standing up the whole environment schema to reach them.
 */
export const BANK_IDENTITY = Symbol('reliance.accounts.bank-identity');

/** The bank's own routing details, as an account number and IBAN are built from them. */
export interface BankIdentity {
  /** ISO 3166-1 alpha-2, the IBAN's first two characters. */
  readonly countryCode: string;
  /** Four alphabetic characters identifying the institution inside the IBAN. */
  readonly bankCode: string;
  /** Six digits. Every Reliance account shares one — the bank has a single clearing entry. */
  readonly sortCode: string;
}

/** Transaction labels, so a retry-conflict log names the operation that caused it. */
export const ACCOUNT_TRANSACTION_LABEL = {
  OPEN: 'accounts.open',
  CLOSE: 'accounts.close',
  UPDATE: 'accounts.update',
  APPLY_DELTA: 'accounts.applyDelta',
} as const;

/**
 * How many accounts one customer may hold open at once.
 *
 * Not a technical limit — a cap exists so a scripted sign-up cannot mint ten thousand
 * account numbers and exhaust the serial space for everybody else.
 */
export const MAX_OPEN_ACCOUNTS_PER_CUSTOMER = 20;

/**
 * Attempts to find an unused account number before giving up.
 *
 * The serial space is 10^8 and the pre-check is an indexed equality read, so more than one
 * attempt is already remarkable; eight makes exhaustion effectively impossible while still
 * refusing to loop forever if the space really is full.
 */
export const MAX_IDENTIFIER_ALLOCATION_ATTEMPTS = 8;

/** Digits in the serial part of an account number — also the IBAN's account segment. */
export const ACCOUNT_SERIAL_DIGITS = 8;

/** Digits appended to the serial as its domestic ISO 7064 check. */
export const DOMESTIC_CHECK_DIGITS = 2;

/** Exclusive upper bound for a serial: 10^{@link ACCOUNT_SERIAL_DIGITS}. */
export const SERIAL_UPPER_BOUND = 100_000_000;

/**
 * Days of no customer-initiated activity before an account is treated as dormant.
 *
 * Dormancy is a housekeeping state, not a restriction: a dormant account still accepts
 * postings and wakes up the moment one lands.
 */
export const DORMANCY_DAYS = 365;
