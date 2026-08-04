/**
 * The payment-rail ports' public surface.
 *
 * Transfers lanes (D-03 domestic, D-04 international) depend on {@link PaymentRailPort}
 * and the types here, and on nothing inside a rail's implementation directory.
 */

export { PaymentRailPort } from './payment-rail.port.js';
export {
  PaymentRailName,
  RailTrackingState,
  type RailAcceptance,
  type RailParty,
  type RailPaymentInstruction,
  type RailRefusal,
  type RailReturnRequest,
  type RailSubmissionOutcome,
  type RailTrackingEntry,
  type RailTrackingReport,
} from './payment-rail.types.js';
