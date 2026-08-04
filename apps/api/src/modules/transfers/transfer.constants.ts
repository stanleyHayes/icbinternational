/**
 * Names, prefixes and windows shared across the transfers module.
 *
 * The journal reference prefixes are the load-bearing entries here. A transfer's reference
 * is derived from its quote id, which makes the ledger's unique index on `reference` the
 * last line of defence against a double debit: whatever else fails, two executions of one
 * quote cannot book two entries.
 */

/** Mongoose model name for an executed transfer. */
export const TRANSFER_MODEL = 'Transfer';

/** Mongoose model name for a priced, bindable quote. */
export const TRANSFER_QUOTE_MODEL = 'TransferQuote';

/** Physical collection holding executed transfers. */
export const TRANSFER_COLLECTION = 'transfers';

/** Physical collection holding quotes. */
export const TRANSFER_QUOTE_COLLECTION = 'transfer_quotes';

/**
 * How long a quote may be executed against.
 *
 * Long enough for a customer to read the confirmation screen and think about it; short
 * enough that the balance, limits and payee standing the quote was priced against are
 * still substantially true. Nothing in an internal transfer moves in fifteen minutes
 * except the account balance, and that is re-checked at execution anyway — the expiry
 * exists so the *customer-visible* figures cannot go stale unnoticed.
 */
export const QUOTE_TTL_MINUTES = 15;

/**
 * How long an executed quote is kept before Mongo reaps it.
 *
 * A consumed quote is the binding evidence for a transfer's pricing, so it outlives the
 * quote's usable window by a long way — a fee dispute is raised weeks later, not minutes.
 */
export const QUOTE_RETENTION_DAYS = 90;

/** Prefix on the journal reference for the transfer leg. Derived from the quote id. */
export const TRANSFER_REFERENCE_PREFIX = 'TRF-';

/** Prefix on the journal reference for the fee leg, booked as its own entry. */
export const TRANSFER_FEE_REFERENCE_PREFIX = 'TRFFEE-';

/** Transaction labels, so a retry log names the operation that produced the conflict. */
export const TRANSFER_TRANSACTION_LABEL = {
  QUOTE: 'transfer.quote',
  EXECUTE: 'transfer.internal',
  CANCEL: 'transfer.cancel',
} as const;

/** Header carrying the proof of a recent re-authentication on a step-up payment. */
export const STEP_UP_HEADER = 'x-step-up-token';

/** Default narrative when the customer supplies no reference of their own. */
export const DEFAULT_TRANSFER_DESCRIPTION = 'Transfer';
