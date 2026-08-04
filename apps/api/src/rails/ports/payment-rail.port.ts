/**
 * The port every payment rail implementation satisfies.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token — the same pattern as `BillerRailPort`. Behind this port sits somebody
 * else's system: a network with its own clock, its own batch cycles and its own moods.
 * Three rules keep that honest:
 *
 * 1. **Outcomes are values, not exceptions.** A refusal or a return is a business event
 *    the customer must be told about; it is returned, never thrown. Throws are reserved
 *    for the bank's own mistakes — tracking an instruction never submitted, returning a
 *    payment already final — which surface as coded `AppError`s.
 * 2. **No success by absence of failure.** The caller may only treat a payment as moving
 *    when {@link submit} resolved with `accepted: true`, and as done when {@link track}
 *    reports `SETTLED`.
 * 3. **Time belongs to the simulated clock.** Latencies, cut-offs and settlement dates
 *    are computed on `ClockService` time, never the wall clock, so advancing the bank's
 *    clock moves payments through their lifecycle exactly as a real day would.
 */

import {
  type RailPaymentInstruction,
  type RailReturnRequest,
  type RailSubmissionOutcome,
  type RailTrackingReport,
} from './payment-rail.types.js';

/**
 * Submit / track / return — the complete contract between the bank and a payment
 * network.
 */
export abstract class PaymentRailPort {
  /**
   * Hands a payment instruction to the network.
   *
   * Resolves with an acceptance or a refusal; it does not throw for a network "no".
   * An accepted payment is not settled money — it is a promise the network keeps at
   * the settlement window reported on the acceptance, and may still break by returning
   * the payment before (or, on some corridors, after) that window.
   */
  abstract submit(instruction: RailPaymentInstruction): Promise<RailSubmissionOutcome>;

  /**
   * Answers "where is this payment?" with the full history the network will disclose.
   *
   * @throws {AppError} `NOT_FOUND` when the instruction was never submitted to this rail.
   */
  abstract track(instructionId: string): Promise<RailTrackingReport>;

  /**
   * Returns a payment to the ordering side, citing a reason code.
   *
   * Models both the bank pulling an unsettled payment back and the receiving bank
   * refusing funds after delivery. The report reflects the payment's new final state.
   *
   * @throws {AppError} `NOT_FOUND` when the instruction is unknown, or
   *   `TRANSACTION_NOT_REVERSIBLE` when the payment is already in a final state that
   *   cannot accept a return.
   */
  abstract requestReturn(request: RailReturnRequest): Promise<RailTrackingReport>;
}
