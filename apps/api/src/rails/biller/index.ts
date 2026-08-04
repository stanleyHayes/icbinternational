/**
 * The biller rail's public surface.
 *
 * Feature modules depend on {@link BillerRailPort} and on nothing else in here. The
 * simulator is exported so a module can bind it, and the pure decision helpers are
 * exported so a test can predict what the network will do to a given payment id without
 * standing the rail up.
 */

export { BillerRailPort } from './biller-rail.port.js';
export {
  BillerRejection,
  type BillerAccepted,
  type BillerAccountCheck,
  type BillerOutcome,
  type BillerRefused,
  type BillerSubmission,
  type TopUpSubmission,
} from './biller-rail.types.js';
export { SimulatedBillerRail } from './simulated-biller.rail.js';
export {
  bucketOf,
  decisionKey,
  drawBps,
  latencyFor,
  receiptFor,
  rejectionFor,
  stableHash,
} from './biller-outcome.js';
export {
  BPS_SCALE,
  DEFAULT_REJECTION_BPS,
  DEFAULT_TIMEOUT_BPS,
  MIN_LATENCY_MS,
  TIMEOUT_LATENCY_MS,
} from './biller.constants.js';
