/**
 * The kernel's seeded decisions, one pure helper per question the network answers.
 *
 * Split from the engine so the engine reads as orchestration — record, resolve, report —
 * while every "what does the network decide?" lives here as a function of
 * `(seed, key, profile)`. The key always contains the instruction id and the attempt,
 * so a decision about one payment can never move another payment's draw.
 */

import { type PaymentRailName, type RailRefusal } from '../ports/payment-rail.types.js';

import {
  OUTAGE_REASON_CODE,
  RAIL_REASON_CODES,
  RAIL_REFERENCE_ALPHABET,
  RAIL_REFERENCE_LENGTH,
} from './kernel.constants.js';
import { type RailBehaviourProfile } from './kernel.types.js';
import { seededInt, seededPick, seededString } from './seeded-random.js';

/** Basis points in a whole; the failure draw runs over this range. */
const BPS_TOTAL = 10_000;

/** Builds the decision key for one instruction: `<rail>:<instructionId>:<attempt>`. */
export function decisionKey(rail: PaymentRailName, instructionId: string, attempt: number): string {
  return `${rail}:${instructionId}:${attempt}`;
}

/**
 * How long the network takes to answer, drawn uniformly inside the profile's band.
 * Reported on the outcome and recorded; the engine never sleeps for it.
 */
export function latencyFor(seed: string, key: string, profile: RailBehaviourProfile): number {
  const span = profile.latencyMaxMs - profile.latencyMinMs + 1;
  return profile.latencyMinMs + seededInt(seed, `${key}:latency`, span);
}

/** The network's own reference for an accepted payment, e.g. `ACH-K7M2XQ9PD4`. */
export function railReferenceFor(seed: string, key: string, rail: PaymentRailName): string {
  const segment = seededString(seed, `${key}:ref`, RAIL_REFERENCE_LENGTH, RAIL_REFERENCE_ALPHABET);
  return `${rail}-${segment}`;
}

/**
 * Whether the network refuses this submission, and why.
 *
 * Returns `null` on acceptance. The outage check comes first and is deterministic —
 * `forceOutage` is a switch, not a draw. The seeded refusal then fires exactly when the
 * instruction's draw falls below the configured rate, which makes failure injection
 * monotone: raising `failureRateBps` can only flip instructions whose draw it crosses,
 * and can never change any other instruction's outcome.
 */
export function refusalFor(
  seed: string,
  key: string,
  profile: RailBehaviourProfile,
): RailRefusal | null {
  if (profile.forceOutage) {
    return {
      accepted: false,
      reasonCode: OUTAGE_REASON_CODE,
      reason: 'The network did not respond; the payment can be submitted again',
      retryable: true,
      latencyMs: latencyFor(seed, key, profile),
    };
  }

  const draw = seededInt(seed, `${key}:fail`, BPS_TOTAL);
  if (draw >= profile.failureRateBps) return null;

  const reason = seededPick(seed, `${key}:reason`, RAIL_REASON_CODES);
  return {
    accepted: false,
    reasonCode: reason.code,
    reason: reason.description,
    retryable: reason.retryable,
    latencyMs: latencyFor(seed, key, profile),
  };
}
