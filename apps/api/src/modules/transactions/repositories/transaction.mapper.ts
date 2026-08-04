import { type TransactionDocument } from '../schemas/transaction.schema.js';

import { type CounterpartyRecord, type TransactionRecord } from './transaction.store.js';

/**
 * Mongoose document to plain record.
 *
 * One conversion, in one place, so a service can never accidentally receive a hydrated
 * document with `.save()` on it. Nested sub-documents are copied field by field rather
 * than spread: `toObject()` would drag Mongoose internals along and a spread of a
 * sub-document carries its prototype, both of which leak the ORM past this boundary.
 */
export function toTransactionRecord(document: TransactionDocument): TransactionRecord {
  return {
    id: document.id,
    accountId: document.accountId,
    journalEntryId: document.journalEntryId,
    userId: document.userId,
    direction: document.direction,
    status: document.status,
    type: document.type,
    amount: { amount: document.amount.amount, currency: document.amount.currency },
    runningBalance: {
      amount: document.runningBalance.amount,
      currency: document.runningBalance.currency,
    },
    originalAmount: document.originalAmount
      ? { amount: document.originalAmount.amount, currency: document.originalAmount.currency }
      : null,
    exchangeRate: document.exchangeRate,
    description: document.description,
    reference: document.reference,
    category: document.category,
    categoryOverridden: document.categoryOverridden,
    counterparty: toCounterpartyRecord(document.counterparty),
    notes: document.notes,
    attachmentIds: [...document.attachmentIds],
    disputeId: document.disputeId,
    bookedAt: document.bookedAt,
    completedAt: document.completedAt,
  };
}

function toCounterpartyRecord(
  counterparty: TransactionDocument['counterparty'],
): CounterpartyRecord | null {
  if (!counterparty) return null;

  return {
    name: counterparty.name,
    merchantId: counterparty.merchantId,
    mcc: counterparty.mcc,
    logoUrl: counterparty.logoUrl,
    accountNumberMasked: counterparty.accountNumberMasked,
    country: counterparty.country,
  };
}
