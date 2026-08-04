/**
 * The kernel's Nest binding.
 *
 * The engine itself is framework-free and takes its instants as parameters; this
 * service is the one place those instants come from `ClockService` — which is exactly
 * what makes rail behaviour move when the operations console advances the simulated
 * clock, and what keeps the wall clock out of every latency, cut-off and settlement
 * decision.
 *
 * Boot behaviour comes from the validated environment: `SIM_SEED` anchors every draw,
 * `SIM_RAIL_FAILURE_BPS` and `SIM_RAIL_LATENCY_MIN/MAX_MS` form the default profile
 * each rail runs under until `configureRail` overrides it.
 */

import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppConfigService } from '../../config/config.service.js';
import {
  type PaymentRailName,
  type RailPaymentInstruction,
  type RailReturnRequest,
  type RailSubmissionOutcome,
  type RailTrackingReport,
} from '../ports/payment-rail.types.js';

import { type RailBehaviourProfile } from './kernel.types.js';
import { type SettlementSlot } from './rail-schedule.js';
import { RailSimulatorKernel } from './simulator-kernel.js';

/** Injectable facade over {@link RailSimulatorKernel}, wired to config and the clock. */
@Injectable()
export class RailKernelService {
  private readonly kernel: RailSimulatorKernel;

  constructor(
    config: AppConfigService,
    private readonly clock: ClockService,
  ) {
    const simulation = config.simulation;
    this.kernel = new RailSimulatorKernel({
      seed: simulation.seed,
      profile: {
        failureRateBps: simulation.railFailureBps,
        latencyMinMs: simulation.latencyMinMs,
        latencyMaxMs: simulation.latencyMaxMs,
        forceOutage: false,
      },
    });
  }

  /** Submits an instruction, stamped with the current simulated instant. */
  submit(instruction: RailPaymentInstruction): RailSubmissionOutcome {
    return this.kernel.submit(instruction, this.clock.now());
  }

  /** Where the payment stands now, on the simulated clock. */
  track(instructionId: string): RailTrackingReport {
    return this.kernel.track(instructionId, this.clock.now());
  }

  /** Returns a payment now, on the simulated clock. */
  requestReturn(request: RailReturnRequest): RailTrackingReport {
    return this.kernel.requestReturn(request, this.clock.now());
  }

  /** The slot a submission right now would settle in — for cut-off promises. */
  nextSettlement(rail: PaymentRailName): SettlementSlot {
    return this.kernel.nextSettlement(rail, this.clock.now());
  }

  /** Overrides a rail's behaviour — the simulation console's failure-injection lever. */
  configureRail(rail: PaymentRailName, profile: RailBehaviourProfile): void {
    this.kernel.configureRail(rail, profile);
  }

  /** The behaviour a rail currently runs under. */
  profileOf(rail: PaymentRailName): RailBehaviourProfile {
    return this.kernel.profileOf(rail);
  }
}
