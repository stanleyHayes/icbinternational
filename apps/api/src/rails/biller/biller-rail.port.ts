import {
  type BillerAccountCheck,
  type BillerOutcome,
  type BillerSubmission,
  type TopUpSubmission,
} from './biller-rail.types.js';

/**
 * The bill-payment network, as the bank is allowed to see it.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token. Everything behind it is somebody else's system: it can be slow, it can
 * refuse, and it can go quiet. The port therefore has no method that cannot fail, and no
 * method whose success the caller may assume from the absence of a throw — the outcome is
 * returned as a value, because "the biller said no" is a business event the customer must
 * be told about, not an exception to be swallowed.
 *
 * The one guarantee the bank makes on its own side: nothing here may be called after the
 * customer has been debited without the caller having a reversal ready. See
 * `BillPaymentProcessor`.
 */
export abstract class BillerRailPort {
  /**
   * Asks the biller whether a reference exists before any money moves.
   *
   * Only meaningful for billers whose `supportsValidation` is true. For the rest the bank
   * validates the *shape* of the reference locally and finds out the rest on submission,
   * which is exactly how the real network behaves.
   */
  abstract checkAccount(input: {
    billerId: string;
    customerReference: string;
  }): Promise<BillerAccountCheck>;

  /** Submits a bill payment. Resolves with an acceptance or a refusal, never a throw. */
  abstract submit(submission: BillerSubmission): Promise<BillerOutcome>;

  /** Submits an airtime or data top-up to the mobile provider's gateway. */
  abstract submitTopUp(submission: TopUpSubmission): Promise<BillerOutcome>;
}
