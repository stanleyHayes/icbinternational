/**
 * The simulator kernel's public surface.
 *
 * Rail lanes import the module (for the wired service) or the engine (for tests and
 * for adapters that manage their own instants). Everything else in here is building
 * material: seeded draws, schedules and the behaviour profile the config drives.
 */

export { RailKernelService } from './rail-kernel.service.js';
export { RailsKernelModule } from './rails-kernel.module.js';
export { RailSimulatorKernel } from './simulator-kernel.js';
export { decisionKey, latencyFor, railReferenceFor, refusalFor } from './kernel-decisions.js';
export {
  DEFAULT_RAIL_SCHEDULES,
  OUTAGE_REASON_CODE,
  RAIL_REASON_CODES,
  RAIL_REFERENCE_ALPHABET,
  RAIL_REFERENCE_LENGTH,
} from './kernel.constants.js';
export {
  type KernelAcceptanceRecord,
  type KernelOptions,
  type KernelPaymentRecord,
  type KernelReturnRecord,
  type RailBehaviourProfile,
} from './kernel.types.js';
export {
  assertValidSchedule,
  isBusinessDay,
  isPastFinalCutOff,
  nextSettlementSlot,
  type CutOffWindow,
  type RailSchedule,
  type SettlementSlot,
} from './rail-schedule.js';
export {
  BPS_TOTAL,
  seededChanceBps,
  seededHash,
  seededInt,
  seededPick,
  seededString,
} from './seeded-random.js';
