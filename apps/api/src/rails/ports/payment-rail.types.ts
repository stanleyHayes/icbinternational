/**
 * The vocabulary every payment rail speaks.
 *
 * Domestic (ACH/RTGS) and international (SWIFT) rails differ enormously inside — batch
 * cycles versus correspondent hops — but the bank's obligation to the customer is the
 * same on all of them: take the instruction, say honestly whether the network accepted
 * it, answer "where is my payment?" at any moment after, and honour a return when the
 * other side sends the money back. These types are that uniform surface.
 *
 * Everything here is a value, not an entity: outcomes are rendered by the rail and
 * consumed by the transfers lanes, and nothing here knows about Nest, Mongo or the
 * ledger.
 */

import { type Money } from '@reliance/money';

/**
 * The payment networks the kernel simulates. Deliberately the same names the
 * operations console uses in `RailBehaviour` (contracts, simulation module), so a
 * behaviour override never needs translating.
 */
export const PaymentRailName = {
  ACH: 'ACH',
  RTGS: 'RTGS',
  SWIFT: 'SWIFT',
} as const;

/** A payment network the bank can submit to. */
export type PaymentRailName = (typeof PaymentRailName)[keyof typeof PaymentRailName];

/** Where a payment stands in its life on the network. */
export const RailTrackingState = {
  /** The network acknowledged the instruction; transmission is in progress. */
  SUBMITTED: 'SUBMITTED',
  /** Transmitted; awaiting the settlement window it was assigned to. */
  IN_TRANSIT: 'IN_TRANSIT',
  /** Value moved on the network's books. Final, unless a return later arrives. */
  SETTLED: 'SETTLED',
  /** The receiving side sent the payment back with a reason code. Final. */
  RETURNED: 'RETURNED',
  /** The network refused the instruction at the door. Final. */
  REJECTED: 'REJECTED',
} as const;

/** A payment's state as the rail reports it. */
export type RailTrackingState = (typeof RailTrackingState)[keyof typeof RailTrackingState];

/** A party to a payment, identified the way the network identifies it. */
export interface RailParty {
  /** Account number, IBAN or virtual account the network routes on. */
  readonly accountReference: string;
  /** Sort code, BIC or routing number of the party's institution. */
  readonly bankCode: string;
  /** Display name, carried for Confirmation-of-Payee style checks. */
  readonly name: string;
}

/**
 * One instruction to move value, as handed to the network.
 *
 * `instructionId` is the bank's id for the payment and is the anchor of determinism:
 * the rail derives every decision about this instruction from the configured seed and
 * this id, so replaying the same instruction under the same seed reproduces the same
 * outcome. `attempt` distinguishes a retry from the original submission — a retry is a
 * fresh draw, but only for this instruction.
 */
export interface RailPaymentInstruction {
  readonly instructionId: string;
  readonly rail: PaymentRailName;
  readonly amount: Money;
  readonly ordering: RailParty;
  readonly beneficiary: RailParty;
  /** Customer-facing reference, carried through to the beneficiary's statement. */
  readonly reference: string;
  /** Submission attempt, starting at 1. Incremented by the caller on each retry. */
  readonly attempt: number;
}

/** The network took the instruction. */
export interface RailAcceptance {
  readonly accepted: true;
  /** The network's own reference for the payment, quoted in tracking and returns. */
  readonly railReference: string;
  /** The settlement batch the payment was assigned to; `null` for continuous rails. */
  readonly batchId: string | null;
  /** The instant the assigned settlement window closes, on the simulated clock. */
  readonly expectedSettlementAt: Date;
  /** `YYYY-MM-DD` value date the beneficiary's bank will apply. */
  readonly valueDate: string;
  /** How long the network took to answer. Reported, never slept. */
  readonly latencyMs: number;
}

/** The network refused the instruction. This is a business answer, not an exception. */
export interface RailRefusal {
  readonly accepted: false;
  /** Machine-readable reason, e.g. an ACH R-code. */
  readonly reasonCode: string;
  /** Human-readable reason, safe to log and to show operations staff. */
  readonly reason: string;
  /**
   * Whether re-submitting the same instruction could succeed. An outage is retryable;
   * a closed beneficiary account is not.
   */
  readonly retryable: boolean;
  readonly latencyMs: number;
}

/** The network's answer to a submission: acceptance or refusal, never a throw. */
export type RailSubmissionOutcome = RailAcceptance | RailRefusal;

/** One entry in a payment's tracking history. */
export interface RailTrackingEntry {
  readonly at: Date;
  readonly state: RailTrackingState;
  readonly detail: string;
}

/** Everything the network will say about a payment right now. */
export interface RailTrackingReport {
  readonly instructionId: string;
  /** `null` while the network has not acknowledged the instruction. */
  readonly railReference: string | null;
  readonly state: RailTrackingState;
  readonly batchId: string | null;
  readonly expectedSettlementAt: Date | null;
  /** Populated once the payment is returned; the R-code the receiver cited. */
  readonly returnReasonCode: string | null;
  readonly timeline: readonly RailTrackingEntry[];
}

/** A request to pull a payment back, or the receiving bank's return of one. */
export interface RailReturnRequest {
  readonly instructionId: string;
  /** The R-code the return cites. Must be a code the rail's catalogue knows. */
  readonly reasonCode: string;
  /** Optional free-text detail, e.g. the receiving bank's narrative. */
  readonly detail?: string;
}
