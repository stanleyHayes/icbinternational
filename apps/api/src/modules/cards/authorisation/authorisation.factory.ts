import { AuthorisationStatus, type DeclineReason } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import {
  responseCodeFor,
  type NetworkAuthorisationContext,
  type NetworkAuthorisationRequest,
  type ThreeDsOutcome,
} from '../../../rails/card-network/index.js';
import { type CardRecord } from '../card.store.js';

import { type NewAuthorisation } from './authorisation.store.js';

/** What both an approval and a decline are assembled from. */
export interface AuthorisationDraft {
  readonly card: CardRecord;
  readonly request: NetworkAuthorisationRequest;
  readonly network: NetworkAuthorisationContext;
  readonly at: Date;
  readonly threeDsChallenged: boolean;
  readonly threeDsOutcome: ThreeDsOutcome | null;
}

/**
 * Building the record of an authorisation attempt.
 *
 * Approvals and declines are the same shape, and that is deliberate rather than
 * convenient. A decline is a fact about a customer's card that they will ask about, that
 * a fraud analyst will trace a compromise through, and that proves a control did
 * something — so it is stored with the same fields, the same merchant detail and the same
 * scheme reference as the approvals around it, not as a thinner second-class row.
 */
export function approvedAuthorisation(
  draft: AuthorisationDraft,
  approved: Money,
): NewAuthorisation {
  return {
    ...base(draft),
    status: AuthorisationStatus.APPROVED,
    amount: toStored(approved),
    declineReason: null,
    responseCode: responseCodeFor(null),
  };
}

/** The record of a refusal, carrying the reason and the code the terminal was given. */
export function declinedAuthorisation(
  draft: AuthorisationDraft,
  reason: DeclineReason,
): NewAuthorisation {
  return {
    ...base(draft),
    status: AuthorisationStatus.DECLINED,
    amount: toStored(draft.request.amount),
    declineReason: reason,
    responseCode: responseCodeFor(reason),
  };
}

/** Everything the two share. */
function base(
  draft: AuthorisationDraft,
): Omit<NewAuthorisation, 'status' | 'amount' | 'declineReason' | 'responseCode'> {
  const { card, request, network } = draft;

  return {
    cardId: card.id,
    accountId: card.accountId,
    userId: card.userId,
    requestedAmount: toStored(request.amount),
    originalAmount: request.originalAmount ? toStored(request.originalAmount) : null,
    merchantId: request.merchantId,
    merchantName: request.merchantName,
    merchantCountry: request.merchantCountry,
    mcc: request.mcc,
    channel: request.channel,
    holdId: null,
    journalEntryId: null,
    transactionId: null,
    threeDsChallenged: draft.threeDsChallenged,
    threeDsOutcome: draft.threeDsOutcome,
    networkReference: network.networkReference,
    clearingReference: null,
    settlementBatchId: null,
    capturedAmount: null,
    refundedAmount: null,
    incrementCount: 0,
    authorisedAt: draft.at,
    capturedAt: null,
    clearedAt: null,
    settledAt: null,
    reversedAt: null,
    expiresAt: network.expiresAt,
  };
}

/**
 * The key the rail draws every deterministic decision for this attempt from.
 *
 * Built from the facts of the payment rather than from a fresh identifier, so replaying a
 * scenario on the same simulated clock produces the same references, the same challenges
 * and the same outages. A random key would make the simulator reproducible only in the
 * sense that it kept running.
 */
export function networkKeyFor(request: NetworkAuthorisationRequest, at: Date): string {
  return [
    request.cardId,
    request.merchantId,
    request.channel,
    request.amount.toString(),
    at.toISOString(),
  ].join('|');
}
