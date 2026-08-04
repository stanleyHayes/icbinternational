import { type StoredMoney } from '../../../common/money/money.codec.js';
import {
  type JournalEntryDocument,
  type JournalEntrySchemaClass,
} from '../schemas/journal-entry.schema.js';
import { type PostingSchemaClass } from '../schemas/posting.schema.js';

import { type JournalEntryRecord, type PostingRecord } from './journal-entry.store.js';

/**
 * Mongoose document to plain record.
 *
 * The conversion exists so that nothing above the repository ever holds a live document.
 * A hydrated document carries `save()`, change tracking and a link to the connection, all
 * of which are ways to write to the system of record from somewhere that has no
 * transaction — and none of which a service has any business with.
 */
export function toJournalEntryRecord(document: JournalEntryDocument): JournalEntryRecord {
  return fromPlain(document.toObject<JournalEntrySchemaClass>());
}

/** Same conversion for a `.lean()` read, which returns a plain object already. */
export function fromPlain(document: JournalEntrySchemaClass): JournalEntryRecord {
  return {
    id: document.id,
    reference: document.reference,
    type: document.type,
    status: document.status,
    description: document.description,
    valueDate: document.valueDate,
    bookedAt: document.bookedAt,
    postings: document.postings.map(toPosting),
    reversesEntryId: document.reversesEntryId ?? null,
    reversedByEntryId: document.reversedByEntryId ?? null,
    metadata: { ...document.metadata },
  };
}

function toPosting(posting: PostingSchemaClass): PostingRecord {
  return {
    ledgerAccountCode: posting.ledgerAccountCode,
    ledgerAccountName: posting.ledgerAccountName,
    accountId: posting.accountId ?? null,
    direction: posting.direction,
    amount: toMoney(posting.amount),
    narrative: posting.narrative,
  };
}

/**
 * Copies the amount out of its sub-document wrapper.
 *
 * A Mongoose sub-document is structurally a `StoredMoney` but is not one — it carries
 * prototype methods that would survive a spread into a log line or a JSON response.
 */
function toMoney(amount: StoredMoney): StoredMoney {
  return { amount: amount.amount, currency: amount.currency };
}
