import { Injectable, Logger } from '@nestjs/common';

import {
  bucketOf,
  decisionKey,
  drawBps,
  latencyFor,
  receiptFor,
  rejectionFor,
} from './biller-outcome.js';
import { BillerRailPort } from './biller-rail.port.js';
import {
  BillerRejection,
  type BillerAccountCheck,
  type BillerOutcome,
  type BillerSubmission,
  type TopUpSubmission,
} from './biller-rail.types.js';
import { DEFAULT_REJECTION_BPS, DEFAULT_TIMEOUT_BPS } from './biller.constants.js';

/** Share of validation lookups where the biller declines to disclose a name. */
const NAME_WITHHELD_BPS = 1_500;

/** Share of validation lookups where the reference is simply not recognised. */
const UNKNOWN_REFERENCE_BPS = 400;

/** Names the directory returns for a validated reference. */
const HOUSEHOLD_NAMES: readonly string[] = Object.freeze([
  'The account holder',
  'Household account',
  'Business account',
]);

/**
 * The bill-payment network, simulated honestly.
 *
 * "Honestly" means it does the things that make bill payment hard rather than the things
 * that make a demo smooth. It refuses payments. It goes quiet. It answers slowly. It
 * declines to tell you whose account a reference belongs to. Every one of those is a state
 * the bank has to have a correct answer for, and a rail that never produced them would let
 * the wrong answer ship.
 *
 * **Timeouts are not rejections.** A refusal is the biller saying no; a timeout is the
 * biller saying nothing, and the money may or may not have arrived. The bank treats both
 * as "did not complete" and reverses, because leaving a customer short while two systems
 * work out what happened is not an option — but the two are recorded distinctly, because
 * only one of them is safe to retry automatically.
 *
 * Nothing here sleeps. The measured latency is reported on the outcome and recorded
 * against the payment, so operations can see a slow biller, while the test suite is not
 * made to wait thirty seconds to prove a timeout reverses.
 */
@Injectable()
export class SimulatedBillerRail extends BillerRailPort {
  private readonly logger = new Logger(SimulatedBillerRail.name);

  override async checkAccount(input: {
    billerId: string;
    customerReference: string;
  }): Promise<BillerAccountCheck> {
    const key = `check:${input.billerId}:${input.customerReference}`;

    if (drawBps(key) < UNKNOWN_REFERENCE_BPS) {
      return { valid: false, accountName: null, rejection: BillerRejection.UNKNOWN_ACCOUNT };
    }

    const withheld = drawBps(`name:${key}`) < NAME_WITHHELD_BPS;
    const name = HOUSEHOLD_NAMES[bucketOf(key, HOUSEHOLD_NAMES.length)] ?? HOUSEHOLD_NAMES[0];

    return { valid: true, accountName: withheld ? null : (name ?? null), rejection: null };
  }

  override async submit(submission: BillerSubmission): Promise<BillerOutcome> {
    return this.decide(
      decisionKey({
        paymentId: submission.paymentId,
        reference: submission.customerReference,
        attempt: submission.attempt,
      }),
      submission.paymentId,
      submission.billerName,
    );
  }

  override async submitTopUp(submission: TopUpSubmission): Promise<BillerOutcome> {
    return this.decide(
      decisionKey({
        paymentId: submission.paymentId,
        reference: `${submission.phone}:${submission.bundle}`,
        attempt: submission.attempt,
      }),
      submission.paymentId,
      submission.provider,
    );
  }

  /**
   * One network decision: timeout first, then refusal, then acceptance.
   *
   * Ordered that way because the bands are cumulative — a submission that has already
   * fallen into the timeout band must not also be eligible to be refused, or the two
   * probabilities would silently overlap and the configured rates would be wrong.
   */
  private decide(key: string, paymentId: string, counterparty: string): BillerOutcome {
    const draw = drawBps(key);

    if (draw < DEFAULT_TIMEOUT_BPS) {
      this.logger.warn(`${counterparty} did not answer for payment ${paymentId}`);
      return {
        accepted: false,
        rejection: BillerRejection.NO_RESPONSE,
        latencyMs: latencyFor(key, true),
      };
    }

    if (draw < DEFAULT_TIMEOUT_BPS + DEFAULT_REJECTION_BPS) {
      const rejection = rejectionFor(key);
      this.logger.warn(`${counterparty} rejected payment ${paymentId}: ${rejection}`);
      return { accepted: false, rejection, latencyMs: latencyFor(key, false) };
    }

    return {
      accepted: true,
      receipt: receiptFor(paymentId),
      latencyMs: latencyFor(key, false),
    };
  }
}
