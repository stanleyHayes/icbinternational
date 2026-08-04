import { type Counterparty, type Transaction } from '@reliance/contracts';
import { type MoneyJSON } from '@reliance/money';

import { fromStored, type StoredMoney } from '../../common/money/money.codec.js';

import {
  type CounterpartyRecord,
  type TransactionRecord,
} from './repositories/transaction.store.js';

/**
 * Record to wire.
 *
 * Storage and the wire share a money shape deliberately (see `money.codec.ts`), so this
 * is mostly a `Date` to ISO-8601 conversion — but it stays an explicit function rather
 * than a cast, because it is the one place that decides what leaves the building. A field
 * added to the schema is not exposed until someone adds it here on purpose.
 */
export function toTransactionResponse(record: TransactionRecord): Transaction {
  return {
    id: record.id,
    accountId: record.accountId,
    journalEntryId: record.journalEntryId,
    direction: record.direction,
    status: record.status,
    type: record.type,
    amount: toMoneyResponse(record.amount),
    runningBalance: toMoneyResponse(record.runningBalance),
    originalAmount: record.originalAmount ? toMoneyResponse(record.originalAmount) : null,
    exchangeRate: record.exchangeRate,
    description: record.description,
    reference: record.reference,
    category: record.category,
    categoryOverridden: record.categoryOverridden,
    counterparty: toCounterpartyResponse(record.counterparty),
    notes: record.notes,
    attachmentIds: [...record.attachmentIds],
    disputeId: record.disputeId,
    bookedAt: toIsoInstant(record.bookedAt),
    completedAt: record.completedAt ? toIsoInstant(record.completedAt) : null,
  };
}

/**
 * Storage money to wire money.
 *
 * The two shapes are identical by design, but storage types the currency as a bare string
 * while the contract types it as a `CurrencyCode`. Round-tripping through `Money` is what
 * turns that assumption into a check: a currency that is not in the table throws here
 * rather than reaching a client that cannot render it.
 */
function toMoneyResponse(stored: StoredMoney): MoneyJSON {
  return fromStored(stored).toJSON();
}

function toCounterpartyResponse(record: CounterpartyRecord | null): Counterparty | null {
  if (!record) return null;

  return {
    name: record.name,
    merchantId: record.merchantId,
    mcc: record.mcc,
    logoUrl: record.logoUrl,
    accountNumberMasked: record.accountNumberMasked,
    country: record.country,
  };
}

/**
 * ISO-8601 with no offset, which is what `isoDateTimeSchema` accepts.
 *
 * `toISOString()` already emits UTC with a `Z`, and the contract's parser reads that as
 * offset-free. Centralised so a future change to the wire time format is one edit.
 */
export function toIsoInstant(at: Date): string {
  return at.toISOString();
}
