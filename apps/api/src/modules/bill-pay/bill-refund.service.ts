import { Injectable, Logger } from '@nestjs/common';

import { BillPaymentStatus } from '@reliance/contracts';

import { TransactionRunner } from '../../database/transaction.runner.js';
import { BillerRejection } from '../../rails/biller/index.js';

import { REFUSAL_COPY, REJECTION_COPY } from './bill-pay.constants.js';
import { BillPaymentPoster } from './bill-payment.poster.js';
import { BillPaymentStore, type BillPaymentRecord } from './bill-payment.store.js';

/** Label the transaction runner logs a retried reversal under. */
const REVERSAL_LABEL = 'billpay.reversal';

/** A refusal may only be recorded against a payment this job is holding. */
const REFUSABLE: readonly BillPaymentStatus[] = [BillPaymentStatus.SUBMITTED];

/** The money may only be returned to a payment that is known to owe it. */
const REFUNDABLE: readonly BillPaymentStatus[] = [BillPaymentStatus.REJECTED];

/** What a refusal needs recorded against the payment. */
export interface RefusalInput {
  readonly payment: BillPaymentRecord;
  readonly rejection: BillerRejection;
  readonly latencyMs: number | null;
}

/**
 * Giving the customer their money back, in two durable steps rather than one.
 *
 * The obvious design — refuse and refund in a single transaction — is the one this replaces,
 * because it has a hole you cannot see from inside it. The payment is claimed `SUBMITTED`
 * with a conditional write, the biller says no, and the refund transaction then fails: a
 * dropped connection, a write conflict that outlives its retries, a stepdown. The payment is
 * now `SUBMITTED` forever. The retry cannot re-claim it, because the conditional write only
 * accepts `PENDING`. The customer is debited, the biller has nothing, and no code path in
 * the bank will ever look at that payment again.
 *
 * So the refusal is recorded first, on its own:
 *
 * 1. **`SUBMITTED` → `REJECTED`** — one conditional write, no ledger work, nothing that can
 *    fail for interesting reasons. The payment now says "the biller refused and the bank
 *    owes this customer money", and that sentence survives every subsequent crash.
 * 2. **`REJECTED` → `REFUNDED`** — the reversal entry and the status move, in one
 *    transaction. If it fails the payment stays in `REJECTED`, which {@link recover} and the
 *    sweep can both claim, and which the retry of the original job can claim too.
 *
 * **Re-running step 2 cannot double-refund.** The reversal's journal reference is derived
 * from the payment id, and `PostingService` returns the entry already booked under a
 * reference rather than booking a second one. That is the guarantee that makes a sweep safe
 * to run as often as you like: the ledger, not this service, is what enforces "once".
 *
 * **The copy tracks the truth.** `REJECTED` says the money is on its way; only `REFUNDED`
 * says it is back, and that sentence is written in the same transaction as the credit.
 */
@Injectable()
export class BillRefundService {
  private readonly logger = new Logger(BillRefundService.name);

  constructor(
    private readonly payments: BillPaymentStore,
    private readonly poster: BillPaymentPoster,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Records the biller's refusal and returns the money.
   *
   * @returns The refunded payment, or the payment as another worker left it when this one
   *   lost the race to record the refusal.
   */
  async refund(input: RefusalInput): Promise<BillPaymentRecord | null> {
    const rejected = await this.reject(input);
    if (rejected) return this.settle(rejected);

    this.logger.log(`Bill payment ${input.payment.id} was refused by another worker first`);
    return this.payments.findByIdUnscoped(input.payment.id);
  }

  /**
   * Finishes a refund somebody else started, or never started.
   *
   * The sweep's entry point, and the retry's. A payment left in `SUBMITTED` past the
   * stranding threshold is treated as unanswered — the standing policy for a payment the
   * bank cannot account for is that the money goes back — and one left in `REJECTED` simply
   * has its reversal completed.
   *
   * @returns The refunded payment, or null when there was nothing owing.
   */
  async recover(payment: BillPaymentRecord): Promise<BillPaymentRecord | null> {
    if (payment.status === BillPaymentStatus.REJECTED) return this.settle(payment);
    if (payment.status !== BillPaymentStatus.SUBMITTED) return null;

    this.logger.warn(
      `Bill payment ${payment.id} was left in SUBMITTED with no answer; refunding it`,
    );

    return this.refund({
      payment,
      rejection: BillerRejection.NO_RESPONSE,
      latencyMs: payment.lastLatencyMs,
    });
  }

  /**
   * `SUBMITTED` → `REJECTED`. The debt is now recorded; the credit is not yet made.
   *
   * @returns Null when the payment had already moved on, which is not an error — a sweep
   *   and a retry racing on one stranded payment is exactly what both are for.
   */
  private async reject(input: RefusalInput): Promise<BillPaymentRecord | null> {
    return this.payments.transition({
      id: input.payment.id,
      fromStatuses: REFUSABLE,
      status: BillPaymentStatus.REJECTED,
      patch: {
        rejection: input.rejection,
        failureReason: REFUSAL_COPY[input.rejection],
        lastLatencyMs: input.latencyMs,
      },
    });
  }

  /**
   * `REJECTED` → `REFUNDED`, booking the reversal in the same unit of work.
   *
   * The payment is re-read inside the transaction rather than trusted from the argument,
   * because the caller may have been holding it since before a sweep finished the job. On a
   * snapshot read a concurrent commit surfaces as a write conflict the runner retries, so
   * the status seen here is the status the transition will act on.
   */
  async settle(payment: BillPaymentRecord): Promise<BillPaymentRecord> {
    return this.runner.run(
      async (session) => {
        const current = await this.payments.findByIdUnscoped(payment.id, session);
        if (!current) throw new Error(`Bill payment ${payment.id} no longer exists`);
        if (current.status !== BillPaymentStatus.REJECTED) return current;

        const reversalEntryId = await this.poster.postReversal(current, session);

        const refunded = await this.payments.transition({
          id: current.id,
          fromStatuses: REFUNDABLE,
          status: BillPaymentStatus.REFUNDED,
          patch: {
            reversalEntryId,
            failureReason: REJECTION_COPY[current.rejection ?? BillerRejection.NO_RESPONSE],
            completedAt: this.poster.now(),
          },
          session,
        });

        // The read above was taken inside this transaction, so a null here is not a race the
        // runner would retry — it is the store contradicting itself. Rolling the reversal back
        // is the only safe answer.
        if (!refunded) throw new Error(`Bill payment ${current.id} changed status mid-refund`);
        return refunded;
      },
      { label: REVERSAL_LABEL },
    );
  }
}
