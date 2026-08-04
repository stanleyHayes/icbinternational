/**
 * Names, limits and metadata keys shared across the transactions module.
 *
 * A model name is a coupling point — the schema declares it, the repository injects it,
 * the module registers it — so it lives here rather than being retyped three times.
 */

/** Mongoose model name for a customer-facing transaction. */
export const TRANSACTION_MODEL = 'Transaction';

/** Physical collection holding the customer-facing projection of the journal. */
export const TRANSACTION_COLLECTION = 'transactions';

/** Name of the compound text index, referenced when the search filter is applied. */
export const TRANSACTION_TEXT_INDEX = 'transaction_text';

/**
 * Ceiling on a single range scan used by insights and exports.
 *
 * Aggregation happens in TypeScript rather than in an aggregation pipeline so that the
 * numbers on the insights screens are computed from exactly the rows the transaction list
 * returns — the two cannot disagree. That is only affordable with a hard bound on how
 * many rows one request may pull, and this is it. Callers page beyond it with `afterId`.
 */
export const MAX_RANGE_SCAN = 1000;

/**
 * Keys the projector reads from a journal entry's `metadata` to enrich a row.
 *
 * A journal entry knows the accounting truth and nothing about merchants, so the module
 * that books the entry (cards, transfers, direct debits) puts the human detail here and
 * the projector lifts it out. Naming the keys in one place is what stops a producer
 * writing `merchant_id` while the consumer reads `merchantId` and no one noticing until a
 * customer's statement is blank.
 */
export const ENTRY_METADATA_KEY = {
  counterpartyName: 'counterpartyName',
  merchantId: 'merchantId',
  mcc: 'mcc',
  logoUrl: 'logoUrl',
  counterpartyAccountMasked: 'counterpartyAccountMasked',
  counterpartyCountry: 'counterpartyCountry',
  originalAmount: 'originalAmount',
  originalCurrency: 'originalCurrency',
  exchangeRate: 'exchangeRate',
} as const;

/** Longest counterparty name the contract's `shortTextSchema` accepts. */
export const MAX_COUNTERPARTY_NAME_LENGTH = 120;
