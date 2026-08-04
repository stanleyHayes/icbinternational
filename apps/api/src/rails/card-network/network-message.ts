/**
 * The message vocabulary of the card rail.
 *
 * These are the shapes that cross the boundary between the bank and the scheme. Nothing
 * here knows about Mongo, holds or journal entries — an authorisation request is a
 * description of what a terminal asked for, and the answer is a description of what the
 * issuer said. Keeping the rail's vocabulary this thin is what lets the authorisation
 * path be reasoned about without a database in the room.
 */

import { type CardScheme } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { type CardChannel } from './card-network.constants.js';

/** What a terminal or gateway presents to the issuer. */
export interface NetworkAuthorisationRequest {
  /** The card the merchant swiped, tapped, typed or has on file. */
  readonly cardId: string;
  /** Stable merchant identifier, as the acquirer reports it. */
  readonly merchantId: string;
  readonly merchantName: string;
  /** ISO 3166-1 alpha-2 country the merchant is registered in. */
  readonly merchantCountry: string;
  /** ISO 18245 merchant category code. */
  readonly mcc: string;
  readonly channel: CardChannel;
  /** Amount in the card's own currency, after any conversion. */
  readonly amount: Money;
  /**
   * Amount in the merchant's currency, when it differs from the card's.
   *
   * Null for a same-currency payment rather than a copy of `amount`, so that a statement
   * can tell "£40" from "€47.10, which we converted to £40".
   */
  readonly originalAmount: Money | null;
  /** Whether the merchant will accept an approval for less than they asked for. */
  readonly partialApprovalAllowed: boolean;
  /** PIN entered at the terminal, for the channels that capture one. */
  readonly pin?: string;
  /** Set when the acquirer has already completed a 3DS challenge of its own. */
  readonly threeDsCompleted?: boolean;
}

/** Whether the issuer will insist on a re-authentication before approving. */
export const ThreeDsRequirement = {
  /** No challenge: the payment is exempt or the channel does not support one. */
  NOT_REQUIRED: 'NOT_REQUIRED',
  /** The cardholder must complete a challenge before the payment is approved. */
  CHALLENGE: 'CHALLENGE',
  /** The acquirer already authenticated the cardholder and passed the proof through. */
  ALREADY_SATISFIED: 'ALREADY_SATISFIED',
} as const;
export type ThreeDsRequirement = (typeof ThreeDsRequirement)[keyof typeof ThreeDsRequirement];

/** How a challenge ended. */
export const ThreeDsOutcome = {
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  ABANDONED: 'ABANDONED',
} as const;
export type ThreeDsOutcome = (typeof ThreeDsOutcome)[keyof typeof ThreeDsOutcome];

/** The rail's view of one authorisation, before the bank's own rules are applied. */
export interface NetworkAuthorisationContext {
  /** Scheme-assigned acquirer reference number, stable for the life of the payment. */
  readonly networkReference: string;
  readonly scheme: CardScheme;
  readonly threeDs: ThreeDsRequirement;
  /** When an approved authorisation lapses if nobody claims it. */
  readonly expiresAt: Date;
  /** Simulated round-trip time, for scenarios that assert on rail latency. */
  readonly latencyMs: number;
  /** False when the switch is down and the issuer cannot be reached at all. */
  readonly issuerReachable: boolean;
}

/** One cleared item, waiting for the batch that will settle it. */
export interface SettlementItem {
  readonly authorisationId: string;
  readonly cardId: string;
  readonly merchantId: string;
  /** What the merchant actually presented, which may be less than was authorised. */
  readonly amount: Money;
  readonly clearedAt: Date;
}

/** A closed settlement batch: what the scheme owes, what it keeps, what arrives. */
export interface SettlementBatch {
  readonly id: string;
  /** Every item the batch closed over, in the order they cleared. */
  readonly items: readonly SettlementItem[];
  /** Sum of the presented amounts. */
  readonly gross: Money;
  /** Interchange the issuer earns on the batch. */
  readonly interchange: Money;
  /** What actually moves between the bank and the scheme: gross less interchange. */
  readonly net: Money;
  readonly cutOffAt: Date;
}
