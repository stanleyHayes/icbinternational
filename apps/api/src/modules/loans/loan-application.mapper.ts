/**
 * A stored application as the contract publishes it.
 *
 * The record carries more than the contract does — the declared finances the decision was
 * made on, which documents have arrived, the score behind the outcome. Those stay inside
 * the bank: they are what an underwriter and an audit need, not what a customer's
 * application screen shows, and the contract draws that line deliberately.
 */

import { type LoanApplication } from '@reliance/contracts';

import { fromStored, toWire } from '../../common/money/money.codec.js';

import { type LoanApplicationRecord } from './loan-application.store.js';

/** Maps one application onto its wire shape. */
export function toContractApplication(record: LoanApplicationRecord): LoanApplication {
  return {
    id: record.id,
    productCode: record.productCode,
    status: record.status,
    requestedAmount: toWire(fromStored(record.requestedAmount)),
    termMonths: record.termMonths,
    purpose: record.purpose,
    offer: record.offer,
    offerExpiresAt: record.offerExpiresAt ? record.offerExpiresAt.toISOString() : null,
    declineReasons: [...record.declineReasons],
    requiredDocumentKinds: outstandingDocuments(record),
    submittedAt: record.submittedAt ? record.submittedAt.toISOString() : null,
    decidedAt: record.decidedAt ? record.decidedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Documents still to come.
 *
 * The contract's `requiredDocumentKinds` is rendered as a checklist, so it carries what is
 * *still* required rather than what was required at the start. A list that never shortens
 * as the customer uploads is a list they stop believing.
 */
export function outstandingDocuments(record: LoanApplicationRecord): string[] {
  const supplied = new Set(record.suppliedDocumentKinds);
  return record.requiredDocumentKinds.filter((kind) => !supplied.has(kind));
}
