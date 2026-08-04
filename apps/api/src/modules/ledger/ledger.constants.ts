/**
 * Names and thresholds shared across the ledger's schemas, repositories and services.
 *
 * They live here rather than next to their first use because a model name is a coupling
 * point: the schema declares it, the repository injects it and the module registers it.
 * Three literals that must agree is three chances to disagree.
 */

/** Mongoose model name for a journal entry. */
export const JOURNAL_ENTRY_MODEL = 'JournalEntry';

/** Mongoose model name for a general-ledger account. */
export const LEDGER_ACCOUNT_MODEL = 'LedgerAccount';

/** Physical collection holding the immutable double-entry records. */
export const JOURNAL_ENTRY_COLLECTION = 'journal_entries';

/** Physical collection holding the chart of accounts. */
export const LEDGER_ACCOUNT_COLLECTION = 'chart_of_accounts';

/**
 * An entry with one posting is not double-entry, it is a wish.
 *
 * Enforced in three independent places — the domain constructor, a Mongoose hook and a
 * server-side `$jsonSchema` validator — because each covers a hole the others leave: a
 * direct `mongosh` write bypasses the first two, and a validator alone cannot help a
 * caller who never reaches the database.
 */
export const MINIMUM_POSTINGS_PER_ENTRY = 2;

/** GL codes are exactly four digits. Matches `ledgerAccountSchema` in the contract. */
export const GL_CODE_PATTERN = /^\d{4}$/;

/** ISO 4217 alphabetic codes are three characters. */
export const CURRENCY_CODE_LENGTH = 3;

/**
 * How many entries the verifier reads per round trip.
 *
 * Large enough that verifying a hundred thousand entries is a few hundred queries, small
 * enough that a single batch cannot exhaust the 16 MB BSON reply limit.
 */
export const VERIFIER_BATCH_SIZE = 500;

/** Prefix applied to a reversing entry's reference so it is recognisable in a statement. */
export const REVERSAL_REFERENCE_PREFIX = 'REV-';

/** Upper bound from `referenceSchema` in the contract. A reference is never truncated. */
export const MAX_REFERENCE_LENGTH = 140;

/** Transaction labels, used in retry logs so a conflict storm names its own source. */
export const LEDGER_TRANSACTION_LABEL = {
  POST: 'ledger.post',
  REVERSE: 'ledger.reverse',
  REPAIR: 'ledger.repair',
  SEED_CHART: 'gl.seedChartOfAccounts',
} as const;
