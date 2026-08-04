/**
 * The kernel's own types: the behaviour profile that config drives, and the records
 * the engine keeps about payments in flight.
 *
 * Where the vocabulary already exists on the port ({@link RailPaymentInstruction},
 * {@link RailSubmissionOutcome}, {@link RailTrackingReport}) the kernel speaks the
 * port's language rather than inventing a parallel one — a rail adapter over the
 * kernel should be a thin rename, not a translation.
 */

import { type PaymentRailName, type RailRefusal } from '../ports/payment-rail.types.js';

import { type RailSchedule } from './rail-schedule.js';

/**
 * How one rail behaves, mirroring `RailBehaviour` in the contracts' simulation module
 * field for field. The boot-time default comes from `SIM_RAIL_FAILURE_BPS` /
 * `SIM_RAIL_LATENCY_*`; the operations console can override a rail at runtime to inject
 * failures or force an outage, and every override is still resolved through the seeded
 * stream — "more failures" never means "different randomness".
 */
export interface RailBehaviourProfile {
  /** Probability a submission is refused, in basis points. 500 = 5%. */
  readonly failureRateBps: number;
  readonly latencyMinMs: number;
  readonly latencyMaxMs: number;
  /** Refuse every submission as a network outage. Proves the reversal paths work. */
  readonly forceOutage: boolean;
}

/** Construction options for the kernel. */
export interface KernelOptions {
  /** The simulation seed (`SIM_SEED`). Every decision derives from this. */
  readonly seed: string;
  /** Default behaviour for every rail, before per-rail overrides. */
  readonly profile: RailBehaviourProfile;
  /** Schedule overrides per rail; unspecified rails use `DEFAULT_RAIL_SCHEDULES`. */
  readonly schedules?: Partial<Readonly<Record<PaymentRailName, RailSchedule>>>;
  /** Behaviour overrides per rail, applied over `profile`. */
  readonly profiles?: Partial<Readonly<Record<PaymentRailName, RailBehaviourProfile>>>;
}

/** What the kernel decided about one accepted instruction. */
export interface KernelAcceptanceRecord {
  readonly railReference: string;
  readonly batchId: string;
  readonly expectedSettlementAt: Date;
  readonly valueDate: string;
  readonly latencyMs: number;
}

/** A return applied to a payment after acceptance. */
export interface KernelReturnRecord {
  readonly reasonCode: string;
  readonly returnedAt: Date;
  readonly detail: string | null;
}

/**
 * Everything the kernel knows about one instruction. The registry of these is the
 * kernel's only state, and it is a pure function of the operation sequence applied to
 * the seed — which is exactly why two kernels fed the same sequence agree byte for
 * byte.
 */
export interface KernelPaymentRecord {
  readonly instructionId: string;
  readonly rail: PaymentRailName;
  readonly submittedAt: Date;
  /** Null when the instruction was refused at the door. */
  readonly acceptance: KernelAcceptanceRecord | null;
  /** The refusal the network answered with; null when it accepted. */
  readonly refusal: RailRefusal | null;
  /** Populated when a return lands on an accepted payment. */
  readonly returnRecord: KernelReturnRecord | null;
}
