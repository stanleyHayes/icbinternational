import {
  JournalEntryStatus,
  TransactionDirection,
  TransactionStatus,
  type SpendCategory,
} from '@reliance/contracts';
import { Money, isCurrencyCode } from '@reliance/money';

import { toStored, type StoredMoney } from '../../../common/money/money.codec.js';
import { type JournalEntryRecord } from '../../ledger/repositories/journal-entry.store.js';
import { type CounterpartyRecord, type NewTransaction } from '../repositories/transaction.store.js';
import { ENTRY_METADATA_KEY } from '../transactions.constants.js';

/** Everything needed to render one statement line, already resolved by the projector. */
export interface TransactionRowInput {
  readonly entry: JournalEntryRecord;
  readonly accountId: string;
  readonly userId: string;
  /** Signed net movement on this account: positive is money in. */
  readonly net: Money;
  /** The account's balance immediately after the entry was applied. */
  readonly runningBalance: Money;
  readonly category: SpendCategory;
}

/**
 * Builds the row, deterministically and without touching anything.
 *
 * Pure on purpose: the projector's only real risk is producing a *different* row on a
 * replay than it did the first time, and a function with no clock, no id source and no
 * database cannot. Every value here is derived from the entry, which is immutable, or
 * from the balance the caller read inside the same transaction.
 */
export function buildTransactionRow(input: TransactionRowInput): NewTransaction {
  const completed = input.entry.status === JournalEntryStatus.POSTED;

  return {
    accountId: input.accountId,
    journalEntryId: input.entry.id,
    userId: input.userId,
    // The sign lives in `direction`; the amount is a magnitude, exactly as a ledger
    // posting is. It also makes the contract's `minAmount`/`maxAmount` filters — which
    // only accept positive integers — mean what a customer expects them to.
    direction: input.net.isNegative ? TransactionDirection.DEBIT : TransactionDirection.CREDIT,
    status: TRANSACTION_STATUS_BY_ENTRY_STATUS[input.entry.status],
    type: input.entry.type,
    amount: toStored(input.net.abs()),
    runningBalance: toStored(input.runningBalance),
    ...originalAmountOf(input.entry),
    description: input.entry.description,
    reference: input.entry.reference,
    category: input.category,
    counterparty: counterpartyOf(input.entry),
    bookedAt: input.entry.bookedAt,
    // A posted entry is settled money — there is no later moment at which it "completes".
    // A pending one genuinely has no completion time yet, and saying so is more useful
    // than back-filling the booking time and pretending.
    completedAt: completed ? input.entry.bookedAt : null,
  };
}

/**
 * A journal entry has three states; a customer-facing transaction has five.
 *
 * The two the ledger cannot produce — `FAILED` and `DISPUTED` — are owned by the modules
 * that cause them: a failed rail attempt never books an entry at all, and a dispute is
 * raised against a row that already exists. Neither is reachable from here, which is why
 * this map is total over `JournalEntryStatus` and not over `TransactionStatus`.
 */
const TRANSACTION_STATUS_BY_ENTRY_STATUS: Readonly<Record<JournalEntryStatus, TransactionStatus>> =
  {
    [JournalEntryStatus.PENDING]: TransactionStatus.PENDING,
    [JournalEntryStatus.POSTED]: TransactionStatus.COMPLETED,
    [JournalEntryStatus.REVERSED]: TransactionStatus.REVERSED,
  };

/**
 * The pre-conversion amount and the rate, when the booking module recorded them.
 *
 * Both or neither. A rate with no original amount cannot be checked by the customer, and
 * an original amount with no rate cannot be explained, so a half-populated pair is
 * dropped rather than shown — a statement that says "converted at some rate" is worse
 * than one that simply shows the settled amount.
 */
function originalAmountOf(
  entry: JournalEntryRecord,
): Pick<NewTransaction, 'originalAmount' | 'exchangeRate'> {
  const amount = entry.metadata[ENTRY_METADATA_KEY.originalAmount];
  const currency = entry.metadata[ENTRY_METADATA_KEY.originalCurrency];
  const rate = entry.metadata[ENTRY_METADATA_KEY.exchangeRate];

  const original = parseStoredMoney(amount, currency);
  if (!original || !rate) return { originalAmount: null, exchangeRate: null };

  return { originalAmount: original, exchangeRate: rate };
}

/** Metadata is free-form strings; anything that is not a clean amount is discarded. */
function parseStoredMoney(amount?: string, currency?: string): StoredMoney | null {
  if (!amount || !currency || !isCurrencyCode(currency)) return null;

  try {
    return toStored(Money.fromMinor(amount, currency));
  } catch {
    // `Money.fromMinor` rejects anything that is not an integer string of minor units.
    // A producer that wrote nonsense loses the enrichment, not the transaction.
    return null;
  }
}

/**
 * Who was on the other side, lifted out of the entry's metadata.
 *
 * The journal knows the accounting truth and nothing about merchants, so the module that
 * books the entry puts the human detail in `metadata` under the keys in
 * {@link ENTRY_METADATA_KEY}. No name means no counterparty: a row with an MCC and no
 * name would render as a blank line on a statement, which is worse than none at all.
 */
function counterpartyOf(entry: JournalEntryRecord): CounterpartyRecord | null {
  const name = entry.metadata[ENTRY_METADATA_KEY.counterpartyName];
  if (!name) return null;

  return {
    name,
    merchantId: entry.metadata[ENTRY_METADATA_KEY.merchantId] ?? null,
    mcc: entry.metadata[ENTRY_METADATA_KEY.mcc] ?? null,
    logoUrl: entry.metadata[ENTRY_METADATA_KEY.logoUrl] ?? null,
    accountNumberMasked: entry.metadata[ENTRY_METADATA_KEY.counterpartyAccountMasked] ?? null,
    country: entry.metadata[ENTRY_METADATA_KEY.counterpartyCountry] ?? null,
  };
}

/** The merchant code an entry carries, if any — the projector needs it before the row exists. */
export function mccOf(entry: JournalEntryRecord): string | null {
  return entry.metadata[ENTRY_METADATA_KEY.mcc] ?? null;
}
