import { Injectable, Logger } from '@nestjs/common';

import { BillPaymentStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';

import { REFUND_STRANDED_AFTER_MS, REFUND_SWEEP_BATCH_SIZE } from './bill-pay.constants.js';
import { BillPaymentStore, type BillPaymentRecord } from './bill-payment.store.js';
import { BillRefundService } from './bill-refund.service.js';

/** What one pass of the sweep found and fixed. */
export interface RefundSweepResult {
  /** Payments that had been owing a refund longer than the threshold. */
  readonly stranded: number;
  /** Of those, how many now have their money back. */
  readonly refunded: number;
}

/**
 * The backstop for a refund that never landed.
 *
 * The submission job repairs its own failures — a reversal that throws leaves the payment in
 * `REJECTED`, and the next attempt of the same job finishes it. This exists for the payments
 * that outlive that: the worker that died mid-reversal and never came back, the job that
 * exhausted its attempts into the dead-letter queue, the deploy that landed between the
 * biller's refusal and the credit. Without it those payments are a customer who has been
 * debited and a bank that has quietly stopped trying.
 *
 * **Idempotent by construction, not by bookkeeping.** There is no "already swept today"
 * marker, because there does not need to be one. A payment that has been refunded no longer
 * matches {@link BillPaymentStore.awaitingRefund}, and a reversal that is somehow attempted
 * twice is deduplicated by the journal's unique index on `reference`. Two passes on the same
 * business date, or twenty, produce exactly one credit — which is the only definition of
 * idempotent worth having for something that moves money.
 *
 * **Business time comes from `ClockService`.** The stranding threshold is measured on the
 * bank's clock against `submittedAt`, so advancing the simulated clock past the threshold
 * makes the sweep see a stranded payment, exactly as a real fifteen minutes would.
 */
@Injectable()
export class BillRefundSweeperService {
  private readonly logger = new Logger(BillRefundSweeperService.name);

  constructor(
    private readonly payments: BillPaymentStore,
    private readonly refunds: BillRefundService,
    private readonly clock: ClockService,
  ) {}

  /**
   * One pass over the payments that owe money and have sat that way too long.
   *
   * A payment that fails here is logged and stepped over rather than allowed to abort the
   * pass, because the customer behind the next payment should not go unpaid on account of
   * the one before it.
   */
  async sweep(): Promise<RefundSweepResult> {
    const before = new Date(this.clock.timestamp() - REFUND_STRANDED_AFTER_MS);
    const stranded = await this.payments.awaitingRefund({
      before,
      limit: REFUND_SWEEP_BATCH_SIZE,
    });

    let refunded = 0;
    for (const payment of stranded) {
      if (await this.finish(payment)) refunded += 1;
    }

    if (stranded.length > 0) {
      this.logger.warn(
        `Refund sweep found ${stranded.length} stranded bill payments and refunded ${refunded}`,
      );
    }

    return { stranded: stranded.length, refunded };
  }

  private async finish(payment: BillPaymentRecord): Promise<boolean> {
    try {
      const settled = await this.refunds.recover(payment);
      return settled?.status === BillPaymentStatus.REFUNDED;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not refund stranded bill payment ${payment.id}: ${reason}`);
      return false;
    }
  }
}
