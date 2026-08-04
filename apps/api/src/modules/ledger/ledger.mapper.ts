import { fromStored, toStored } from '../../common/money/money.codec.js';
import { JournalEntry, Posting } from '../../domain/ledger/index.js';

import {
  type JournalEntryRecord,
  type NewJournalEntry,
  type PostingRecord,
} from './repositories/journal-entry.store.js';

/**
 * Translation between the framework-free domain and the persisted record.
 *
 * Two representations exist on purpose. The domain type enforces the balance invariant in
 * its constructor and holds `Money`; the record type is flat, serialisable and holds
 * `StoredMoney`. Keeping both conversions in one file means there is exactly one place to
 * look when a value survives the round trip in the wrong shape.
 */

/** Domain entry to the shape the store writes. */
export function toNewJournalEntry(entry: JournalEntry): NewJournalEntry {
  return {
    reference: entry.reference,
    type: entry.type,
    status: entry.status,
    description: entry.description,
    valueDate: entry.valueDate,
    bookedAt: entry.bookedAt,
    postings: entry.postings.map(toPostingRecord),
    reversesEntryId: entry.reversesEntryId,
    metadata: { ...entry.metadata },
  };
}

export function toPostingRecord(posting: Posting): PostingRecord {
  return {
    ledgerAccountCode: posting.ledgerAccountCode,
    ledgerAccountName: posting.ledgerAccountName,
    accountId: posting.accountId,
    direction: posting.direction,
    amount: toStored(posting.amount),
    narrative: posting.narrative,
  };
}

/**
 * Persisted record back to a domain entry.
 *
 * `JournalEntry.create` re-runs the balance check, so reading an entry out of the
 * database proves it still balances. That is not redundant: it is the cheapest possible
 * integrity check on the system of record, and it runs every time a reversal is built
 * from an original.
 *
 * @throws {import('../../domain/ledger/index.js').UnbalancedEntryError} if the stored
 *   entry has been corrupted since it was written.
 */
export function toDomainEntry(record: JournalEntryRecord): JournalEntry {
  return JournalEntry.create({
    reference: record.reference,
    type: record.type,
    status: record.status,
    description: record.description,
    valueDate: record.valueDate,
    bookedAt: record.bookedAt,
    postings: record.postings.map(toDomainPosting),
    reversesEntryId: record.reversesEntryId,
    metadata: { ...record.metadata },
  });
}

export function toDomainPosting(posting: PostingRecord): Posting {
  return Posting.create({
    ledgerAccountCode: posting.ledgerAccountCode,
    accountId: posting.accountId,
    direction: posting.direction,
    amount: fromStored(posting.amount),
    narrative: posting.narrative,
  });
}
