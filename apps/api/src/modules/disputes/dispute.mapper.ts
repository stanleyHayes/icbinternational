import { type DisputeDocument } from './dispute.schema.js';
import { type DisputeRecord } from './dispute.store.js';

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
