/**
 * The deterministic simulator kernel every payment rail runs on.
 *
 * Framework-free by design: the engine takes the instant it reasons about as a
 * parameter on every call, so it never touches a clock at all. The Nest binding
 * (`RailKernelService`) feeds it `ClockService.now()`; tests feed it fixtures. Given
 * the same seed and the same sequence of operations at the same instants, two kernels
 * produce byte-identical outcomes — that property is the acceptance test of D-01 and
 * is asserted in `__tests__/simulator-kernel.test.ts`.
 *
 * Honesty rules the engine keeps, so the rails above it cannot help but be honest:
 *
 * - **Latency is real.** Acceptance carries the network's response time and the
 *   tracking timeline reflects it — a payment is `SUBMITTED` until the network's
 *   answer would have arrived. The engine reports the latency; it never sleeps.
 * - **Failure is config-driven.** Refusals come from the seeded draw crossing the
 *   configured `failureRateBps`, or from `forceOutage`. There is no other source.
 * - **Cut-offs are real.** A payment settles at the next window of its rail's
 *   schedule, business days only, with the rail's value-date lag on top.
 * - **Settlement is batched.** Every acceptance names the batch it will settle in,
 *   so reconciliation has something to reconcile against.
 */

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import {
  type PaymentRailName,
  type RailPaymentInstruction,
  type RailReturnRequest,
  type RailSubmissionOutcome,
  type RailTrackingReport,
} from '../ports/payment-rail.types.js';

import { decisionKey, latencyFor, railReferenceFor, refusalFor } from './kernel-decisions.js';
import { buildReport, resolveState } from './kernel-report.js';
import { DEFAULT_RAIL_SCHEDULES, RAIL_REASON_CODES } from './kernel.constants.js';
import {
  type KernelOptions,
  type KernelPaymentRecord,
  type RailBehaviourProfile,
} from './kernel.types.js';
import {
  assertValidSchedule,
  nextSettlementSlot,
  type RailSchedule,
  type SettlementSlot,
} from './rail-schedule.js';
import { BPS_TOTAL } from './seeded-random.js';

/** States from which a return can still move the payment. */
const RETURNABLE_STATES: ReadonlySet<string> = new Set(['SUBMITTED', 'IN_TRANSIT', 'SETTLED']);

/** The deterministic engine. See the file header for the honesty rules it keeps. */
export class RailSimulatorKernel {
  private readonly seed: string;
  private readonly baseProfile: RailBehaviourProfile;
  private readonly schedules: Record<PaymentRailName, RailSchedule>;
  private readonly profiles = new Map<PaymentRailName, RailBehaviourProfile>();
  private readonly registry = new Map<string, KernelPaymentRecord>();

  constructor(options: KernelOptions) {
    assertValidProfile(options.profile);
    this.seed = options.seed;
    this.baseProfile = options.profile;
    this.schedules = { ...DEFAULT_RAIL_SCHEDULES, ...options.schedules };
    for (const schedule of Object.values(this.schedules)) assertValidSchedule(schedule);
    for (const [rail, profile] of Object.entries(options.profiles ?? {})) {
      this.configureRail(rail as PaymentRailName, profile);
    }
  }

  /**
   * Overrides one rail's behaviour at runtime — the operations console's chaos lever.
   * Overrides re-seed nothing: the draws were always there; this only moves the
   * threshold they are compared against.
   *
   * @throws {RangeError} On an out-of-range rate or an inverted latency band.
   */
  configureRail(rail: PaymentRailName, profile: RailBehaviourProfile): void {
    assertValidProfile(profile);
    this.profiles.set(rail, profile);
  }

  /** The behaviour a rail currently runs under: its override, else the boot default. */
  profileOf(rail: PaymentRailName): RailBehaviourProfile {
    return this.profiles.get(rail) ?? this.baseProfile;
  }

  /**
   * The settlement slot a submission right after `after` would land in. Transfers
   * lanes call this to refuse a "same-day" promise whose cut-off has already passed
   * (`CUT_OFF_PASSED`) before any money moves.
   */
  nextSettlement(rail: PaymentRailName, after: Date): SettlementSlot {
    return nextSettlementSlot(this.schedules[rail], after);
  }

  /**
   * Accepts or refuses one instruction. The outcome is a value — the network saying
   * no is a business event, not an exception.
   */
  submit(instruction: RailPaymentInstruction, at: Date): RailSubmissionOutcome {
    const key = decisionKey(instruction.rail, instruction.instructionId, instruction.attempt);
    const profile = this.profileOf(instruction.rail);
    const refusal = refusalFor(this.seed, key, profile);

    if (refusal !== null) {
      this.remember({
        instructionId: instruction.instructionId,
        rail: instruction.rail,
        submittedAt: at,
        acceptance: null,
        refusal,
        returnRecord: null,
      });
      return refusal;
    }

    return this.accept(instruction, at, key, profile);
  }

  /**
   * The accepted path: pick a latency, find the settlement slot it lands in, and remember
   * the acceptance so a later status query answers the same way.
   */
  private accept(
    instruction: RailPaymentInstruction,
    at: Date,
    key: string,
    profile: RailBehaviourProfile,
  ): RailSubmissionOutcome {
    const latencyMs = latencyFor(this.seed, key, profile);
    const transmitted = new Date(at.getTime() + latencyMs);
    const slot = this.nextSettlement(instruction.rail, transmitted);

    const acceptance = {
      accepted: true as const,
      railReference: railReferenceFor(this.seed, key, instruction.rail),
      batchId: slot.batchId,
      expectedSettlementAt: slot.settleAt,
      valueDate: slot.valueDate,
      latencyMs,
    };

    this.remember({
      instructionId: instruction.instructionId,
      rail: instruction.rail,
      submittedAt: at,
      acceptance: {
        railReference: acceptance.railReference,
        batchId: slot.batchId,
        expectedSettlementAt: slot.settleAt,
        valueDate: slot.valueDate,
        latencyMs,
      },
      refusal: null,
      returnRecord: null,
    });

    return acceptance;
  }

  /**
   * Where a payment stands at `at`, with its disclosable history.
   *
   * @throws {AppError} `NOT_FOUND` when the instruction was never submitted.
   */
  track(instructionId: string, at: Date): RailTrackingReport {
    return buildReport(this.known(instructionId), at);
  }

  /**
   * Returns a payment, citing an R-code from the rail's catalogue.
   *
   * @throws {AppError} `NOT_FOUND` for an unknown instruction, `VALIDATION_FAILED` for
   *   a code the catalogue does not know, or `TRANSACTION_NOT_REVERSIBLE` when the
   *   payment is already final.
   */
  requestReturn(request: RailReturnRequest, at: Date): RailTrackingReport {
    const record = this.known(request.instructionId);
    assertKnownReasonCode(request.reasonCode);

    const state = resolveState(record, at);
    if (!RETURNABLE_STATES.has(state)) {
      throw AppError.conflict(
        ErrorCode.TRANSACTION_NOT_REVERSIBLE,
        `Payment ${request.instructionId} is ${state} and cannot accept a return`,
      );
    }

    this.registry.set(request.instructionId, {
      ...record,
      returnRecord: {
        reasonCode: request.reasonCode,
        returnedAt: at,
        detail: request.detail ?? null,
      },
    });
    return buildReport(this.known(request.instructionId), at);
  }

  /** How many instructions the kernel remembers — an ops gauge, not a limit. */
  get knownPaymentCount(): number {
    return this.registry.size;
  }

  /** The record for an instruction, or a coded not-found. */
  private known(instructionId: string): KernelPaymentRecord {
    const record = this.registry.get(instructionId);
    if (record === undefined) throw AppError.notFound('Rail payment', instructionId);
    return record;
  }

  /** Files a submission. A later attempt at the same instruction supersedes the earlier record. */
  private remember(record: KernelPaymentRecord): void {
    this.registry.set(record.instructionId, record);
  }
}

/**
 * @throws {RangeError} On an out-of-range failure rate or inverted latency band —
 *   configuration defects that must fail loudly, not misbehave per payment.
 */
function assertValidProfile(profile: RailBehaviourProfile): void {
  if (
    !Number.isInteger(profile.failureRateBps) ||
    profile.failureRateBps < 0 ||
    profile.failureRateBps > BPS_TOTAL
  ) {
    throw new RangeError(`failureRateBps must be an integer in [0, ${BPS_TOTAL}]`);
  }
  if (profile.latencyMinMs < 0 || profile.latencyMaxMs < profile.latencyMinMs) {
    throw new RangeError('latency band must be non-negative with min <= max');
  }
}

/** @throws {AppError} `VALIDATION_FAILED` when the code is outside the rail's catalogue. */
function assertKnownReasonCode(reasonCode: string): void {
  const known = RAIL_REASON_CODES.some((entry) => entry.code === reasonCode);
  if (known) return;
  throw AppError.validation(`Unknown return reason code ${reasonCode}`, [
    { path: 'reasonCode', message: 'must be a code from the rail return catalogue' },
  ]);
}
