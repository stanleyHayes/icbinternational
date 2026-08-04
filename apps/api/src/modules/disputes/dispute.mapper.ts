import { type Dispute } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { toIso } from '../accounts/index.js';

import { type DisputeDocument } from './dispute.schema.js';
import { type DisputeRecord, type DisputeTimelineRecord } from './dispute.store.js';

/**
 * Mongoose document to the plain record services see.
 *
 * A service holding a `HydratedDocument` is a service holding `.save()` — a way to
 * mutate a case outside the store's targeted writes. The mapping happens here, once,
 * at the repository boundary.
 */
export function toDisputeRecord(document: DisputeDocument): DisputeRecord {
  const doc = document.toObject();

  return {
    id: doc.id,
    transactionId: doc.transactionId,
    userId: doc.userId,
    accountId: doc.accountId,
    status: doc.status,
    reason: doc.reason,
    description: doc.description,
    disputedAmount: doc.disputedAmount,
    provisionalCredit: doc.provisionalCredit,
    provisionalCreditAt: doc.provisionalCreditAt,
    provisionalCreditEntryId: doc.provisionalCreditEntryId,
    resolutionEntryId: doc.resolutionEntryId,
    evidenceIds: [...doc.evidenceIds],
    merchantResponse: doc.merchantResponse,
    outcomeSummary: doc.outcomeSummary,
    contactedMerchant: doc.contactedMerchant,
    timeline: doc.timeline.map((step) => ({ ...step })),
    merchantResponseDueAt: doc.merchantResponseDueAt,
    decisionDueAt: doc.decisionDueAt,
    createdAt: doc.createdAt,
    resolvedAt: doc.resolvedAt,
  };
}

/**
 * Persistence record to the frozen wire contract.
 *
 * Four stored fields are deliberately absent from the wire because `disputeSchema` has no
 * home for them: `userId` and `accountId` are how the case is scoped rather than anything
 * the holder needs told, `contactedMerchant` is an input the customer already knows they
 * gave, and `merchantResponseDueAt` is an internal scheme clock. The deadline a customer
 * is entitled to is `decisionDueAt`, and that one is on the wire.
 */
export function toContractDispute(record: DisputeRecord): Dispute {
  return {
    id: record.id,
    transactionId: record.transactionId,
    status: record.status,
    reason: record.reason,
    description: record.description,
    disputedAmount: toWireMoney(record.disputedAmount),
    provisionalCredit: record.provisionalCredit ? toWireMoney(record.provisionalCredit) : null,
    provisionalCreditAt: record.provisionalCreditAt ? toIso(record.provisionalCreditAt) : null,
    evidenceIds: [...record.evidenceIds],
    merchantResponse: record.merchantResponse,
    outcomeSummary: record.outcomeSummary,
    timeline: record.timeline.map(toWireStep),
    decisionDueAt: toIso(record.decisionDueAt),
    createdAt: toIso(record.createdAt),
    resolvedAt: record.resolvedAt ? toIso(record.resolvedAt) : null,
  };
}

type WireMoney = Dispute['disputedAmount'];

/**
 * Storage and wire share a shape; only the currency's type narrows.
 *
 * The cast is safe because the currency reached storage through `toStored`, which only
 * ever writes a `CurrencyCode`. Re-parsing it here would buy nothing a schema at the edge
 * has not already bought.
 */
function toWireMoney(stored: StoredMoney): WireMoney {
  return { amount: stored.amount, currency: stored.currency as WireMoney['currency'] };
}

function toWireStep(step: DisputeTimelineRecord): Dispute['timeline'][number] {
  return { status: step.status, at: toIso(step.at), detail: step.detail };
}
