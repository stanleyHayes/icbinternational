import { type Transfer, type TransferQuote } from '@reliance/contracts';

import { toIso } from '../accounts/index.js';

import { type QuoteRecord } from './quote.store.js';
import { toContractTimeline } from './transfer-timeline.js';
import { type TransferRecord } from './transfer.store.js';

/**
 * Persisted shapes to the wire.
 *
 * Three fields are deliberately not projected: `userId`, because echoing the owner's id
 * back to the owner tells them nothing and gives a future bug a way to leak it;
 * `destinationAccountId`, because the payee's internal account id is *their* identifier
 * and the sender has no need for it; and `feeJournalEntryId`, because the contract models
 * a transfer as having one entry and the fee leg is an implementation detail of how the
 * bank books its income.
 */

export function toContractTransfer(record: TransferRecord): Transfer {
  return {
    id: record.id,
    rail: record.rail,
    status: record.status,
    sourceAccountId: record.sourceAccountId,
    destination: record.destination,
    debitAmount: toWireMoney(record.debitAmount),
    creditAmount: toWireMoney(record.creditAmount),
    fee: toWireMoney(record.fee),
    exchangeRate: record.exchangeRate,
    reference: record.reference,
    railReference: record.railReference,
    returnCode: record.returnCode,
    returnReason: record.returnReason,
    journalEntryId: record.journalEntryId,
    timeline: toContractTimeline(record.timeline),
    estimatedArrival: record.estimatedArrival ? toIso(record.estimatedArrival) : null,
    createdAt: toIso(record.createdAt),
    settledAt: record.settledAt ? toIso(record.settledAt) : null,
  };
}

export function toContractQuote(record: QuoteRecord): TransferQuote {
  return {
    id: record.id,
    rail: record.rail,
    debitAmount: toWireMoney(record.debitAmount),
    creditAmount: toWireMoney(record.creditAmount),
    fee: toWireMoney(record.fee),
    exchangeRate: record.exchangeRate,
    rateExpiresAt: record.rateExpiresAt ? toIso(record.rateExpiresAt) : null,
    estimatedArrival: toIso(record.estimatedArrival),
    cutOffAt: record.cutOffAt ? toIso(record.cutOffAt) : null,
    requiresStepUp: record.requiresStepUp,
    warnings: [...record.warnings],
    expiresAt: toIso(record.expiresAt),
  };
}

/**
 * Stored money to wire money.
 *
 * They are the same shape by design — see `money.codec.ts` — so this is a widening of the
 * currency's type rather than a conversion. Stated as a function anyway, so that if the
 * two representations ever diverge there is one place that finds out.
 */
function toWireMoney(stored: { amount: string; currency: string }): Transfer['debitAmount'] {
  return {
    amount: stored.amount,
    currency: stored.currency as Transfer['debitAmount']['currency'],
  };
}
