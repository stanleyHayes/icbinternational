import { Injectable, Logger } from '@nestjs/common';

import { BillPaymentStatus } from '@reliance/contracts';

import { fromStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { BillerRailPort, type BillerOutcome } from '../../rails/biller/index.js';

import { BillPaymentPoster } from './bill-payment.poster.js';
import { BillPaymentStore, PaymentKind, type BillPaymentRecord } from './bill-payment.store.js';
import { BillRefundService } from './bill-refund.service.js';

/** Statuses a submission may act on. Anything else means somebody got there first. */
const SUBMITTABLE: readonly BillPaymentStatus[] = [BillPaymentStatus.PENDING];

/** A settlement may only be written against a payment this job is still holding. */
const SETTLEABLE: readonly BillPaymentStatus[] = [BillPaymentStatus.SUBMITTED];

/** Label the transaction runner logs a retried settlement or reversal under. */
const OUTCOME_LABEL = 'billpay.outcome';

/**
 * Sending a payment to the biller, and dealing with the answer.
 *
 * **A failure after the debit is reversed by this job.** Not when somebody notices, not by a
 * process that might quietly give up — the refusal is recorded the instant it is known, and
 * the money goes back in a transaction that any retry, and the sweep, can re-run until it
 * lands. There is no reachable state in which the biller has said no, the money has left the
 * customer, and nothing is coming to fix it.
 *
 * That is the bargain that justifies debiting up front. The bank takes the money before it
 * knows whether the payment will succeed, so the bank carries the entire risk of it not
 * succeeding. A customer must never be left short because a third party timed out.
 *
 * The payment is claimed with a conditional write before the rail is called, so two workers
 * racing on one payment cannot both submit it. What this service deliberately does *not* do
 * is treat an unclaimable payment as finished: a payment sitting in `REJECTED` still owes
 * its customer money, and {@link submit} finishes that before it reports back.
 */
@Injectable()
export class BillSubmissionService {
  private readonly logger = new Logger(BillSubmissionService.name);

  constructor(
    private readonly payments: BillPaymentStore,
    private readonly poster: BillPaymentPoster,
    private readonly rail: BillerRailPort,
    private readonly refunds: BillRefundService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Submits one payment and applies whatever came back.
   *
   * @returns The payment in its settled state, or null when it was already dealt with.
   */
  async submit(paymentId: string): Promise<BillPaymentRecord | null> {
    const claimed = await this.claim(paymentId);
    if (!claimed) return this.resume(paymentId);

    const outcome = await this.send(claimed);

    return outcome.accepted
      ? this.complete(claimed, outcome.receipt, outcome.latencyMs)
      : this.refunds.refund({
          payment: claimed,
          rejection: outcome.rejection,
          latencyMs: outcome.latencyMs,
        });
  }

  /** Marks the payment submitted, and only from `PENDING`. Null means it was taken. */
  private async claim(paymentId: string): Promise<BillPaymentRecord | null> {
    return this.payments.transition({
      id: paymentId,
      fromStatuses: SUBMITTABLE,
      status: BillPaymentStatus.SUBMITTED,
      patch: { submittedAt: this.poster.now() },
      countAttempt: true,
    });
  }

  /**
   * What to do with a payment this attempt could not claim.
   *
   * Usually nothing: another worker settled it. But a payment in `REJECTED` is one whose
   * biller refused and whose reversal did not land, and this is the retry that the two-step
   * refund exists to make possible. Finishing it here means the common case — a transient
   * failure on the reversal — is repaired in seconds by BullMQ's own backoff, and the sweep
   * only ever sees the payments that outlived the job's attempt budget.
   */
  private async resume(paymentId: string): Promise<BillPaymentRecord | null> {
    const current = await this.payments.findByIdUnscoped(paymentId);

    if (current?.status !== BillPaymentStatus.REJECTED) {
      this.logger.log(`Bill payment ${paymentId} was already handled`);
      return null;
    }

    this.logger.warn(`Bill payment ${paymentId} still owes a refund; completing it now`);
    return this.refunds.settle(current);
  }

  /** The network call itself. A bill and a top-up differ only in which gateway answers. */
  private async send(payment: BillPaymentRecord): Promise<BillerOutcome> {
    if (payment.kind === PaymentKind.TOP_UP && payment.topUp) {
      return this.rail.submitTopUp({
        paymentId: payment.id,
        provider: payment.topUp.provider,
        phone: payment.topUp.phone,
        bundle: payment.topUp.bundle,
        bundleCode: payment.topUp.bundleCode,
        amount: fromStored(payment.amount).toJSON(),
        attempt: payment.attempts,
      });
    }

    return this.rail.submit({
      paymentId: payment.id,
      billerId: payment.billerId,
      billerName: payment.billerName,
      customerReference: payment.customerReference,
      amount: fromStored(payment.amount).toJSON(),
      attempt: payment.attempts,
    });
  }

  /**
   * The biller took it: settle the in-flight liability and charge the fee.
   *
   * The payment is re-read inside the transaction because an acknowledgement can arrive
   * after the sweep has already given the money back — a biller that answers twenty minutes
   * late has not earned the right to un-refund a customer. In that case nothing is posted
   * and the refund stands; the settlement would otherwise sit in the ledger alongside a
   * reversal for the same payment, which is two truths about one debit.
   */
  private async complete(
    payment: BillPaymentRecord,
    receipt: string,
    latencyMs: number,
  ): Promise<BillPaymentRecord | null> {
    return this.runner.run(
      async (session) => {
        const current = await this.payments.findByIdUnscoped(payment.id, session);
        if (current?.status !== BillPaymentStatus.SUBMITTED) {
          this.logger.warn(
            `Late acknowledgement for bill payment ${payment.id}; the refund already stands`,
          );
          return current;
        }

        const entries = await this.poster.postSettlement(current, session);

        const settled = await this.payments.transition({
          id: current.id,
          fromStatuses: SETTLEABLE,
          status: BillPaymentStatus.COMPLETED,
          patch: {
            ...entries,
            billerReceipt: receipt,
            lastLatencyMs: latencyMs,
            completedAt: this.poster.now(),
          },
          session,
        });

        // The read above was taken inside this transaction, so a null here is the store
        // contradicting itself rather than a race. Throwing rolls the settlement back with it.
        if (!settled) throw new Error(`Bill payment ${current.id} changed status mid-settlement`);
        return settled;
      },
      { label: OUTCOME_LABEL },
    );
  }
}
