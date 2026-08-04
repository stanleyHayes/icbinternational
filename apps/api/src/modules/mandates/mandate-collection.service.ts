import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode, MandateStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import { MANDATE_SWEEP_BATCH } from './mandate.constants.js';
import { MandatePoster } from './mandate.poster.js';
import { alreadyCancelled, MandateService } from './mandate.service.js';
import { MandateStore, type MandateRecord } from './mandate.store.js';

/** Label the transaction runner logs a retried collection under. */
const COLLECTION_LABEL = 'mandate.collect';

/** Raised inside the transaction when the mandate stopped being collectable. */
class MandateNotCollectableError extends Error {}

/**
 * A merchant taking money under an authority the customer gave them.
 *
 * **Cancelling blocks the next collection, and the database is what enforces it.** The
 * collection is recorded with a conditional write naming `ACTIVE`; if the customer's
 * cancellation lands first that write matches nothing, the whole transaction rolls back, and
 * the debit posted moments earlier goes with it. A check taken before the transaction would
 * leave a window in which a customer who had just cancelled was collected from anyway, and
 * that window is exactly the one people complain about.
 *
 * **A collection above the agreed ceiling is refused, not queried.** The customer signed up
 * to a maximum; a merchant exceeding it has broken the authority, and taking the money and
 * sorting it out later is not the behaviour that agreement describes.
 */
@Injectable()
export class MandateCollectionService {
  private readonly logger = new Logger(MandateCollectionService.name);

  constructor(
    private readonly mandates: MandateStore,
    private readonly poster: MandatePoster,
    private readonly service: MandateService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Collects once under a mandate.
   *
   * @throws {AppError} `MANDATE_CANCELLED` when the authority is not live,
   *   `AMOUNT_ABOVE_MAXIMUM` above the agreed ceiling, `INVALID_AMOUNT` when a
   *   variable mandate is collected without one, and `INSUFFICIENT_FUNDS`.
   */
  async collect(input: { mandateId: string; amount?: Money }): Promise<MandateRecord> {
    const mandate = await this.require(input.mandateId);
    const amount = this.amountFor(mandate, input.amount);

    assertCollectable(mandate);
    assertWithinCeiling(mandate, amount);

    try {
      return await this.runner.run(
        async (session) => {
          const collected = await this.poster.collect({ mandate, amount, session });
          const at = this.poster.now();

          const recorded = await this.mandates.recordCollection({
            mandateId: mandate.id,
            collection: {
              ...collected,
              amount: toStored(amount),
              collectedAt: at,
              refundedAt: null,
              refundEntryId: null,
              refundReason: null,
            },
            nextExpectedAt: this.service.nextCollectionAfter(mandate.frequency, at),
            session,
          });

          if (!recorded) throw new MandateNotCollectableError(mandate.id);
          return recorded;
        },
        { label: COLLECTION_LABEL },
      );
    } catch (error) {
      if (error instanceof MandateNotCollectableError) throw alreadyCancelled(mandate.id);
      throw error;
    }
  }

  /**
   * One sweep: collects every mandate whose next date has arrived.
   *
   * A mandate that fails — insufficient funds, a cancellation mid-sweep — does not stop the
   * others. Each is its own transaction, and a failure is logged and left for the merchant's
   * next attempt, exactly as an unpaid direct debit behaves.
   */
  async collectDue(): Promise<{ attempted: number; collected: number }> {
    const due = await this.mandates.dueForCollection(this.poster.now(), MANDATE_SWEEP_BATCH);
    let collected = 0;

    for (const mandate of due) {
      if (await this.tryCollect(mandate)) collected += 1;
    }

    return { attempted: due.length, collected };
  }

  private async tryCollect(mandate: MandateRecord): Promise<boolean> {
    try {
      await this.collect({ mandateId: mandate.id });
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Direct Debit ${mandate.id} could not be collected: ${reason}`);
      return false;
    }
  }

  private async require(mandateId: string): Promise<MandateRecord> {
    const mandate = await this.mandates.findByIdUnscoped(mandateId);
    if (!mandate) throw AppError.notFound('That Direct Debit', mandateId);
    return mandate;
  }

  /** A fixed mandate collects its own figure; a variable one collects what was asked for. */
  private amountFor(mandate: MandateRecord, requested: Money | undefined): Money {
    if (mandate.fixedAmount) return fromStored(mandate.fixedAmount);
    if (requested) return requested;

    throw new AppError({
      code: ErrorCode.INVALID_AMOUNT,
      message: 'A variable Direct Debit must say how much is being collected.',
      context: { mandateId: mandate.id },
    });
  }
}

function assertCollectable(mandate: MandateRecord): void {
  if (mandate.status === MandateStatus.ACTIVE) return;
  if (mandate.status === MandateStatus.CANCELLED) throw alreadyCancelled(mandate.id);

  throw new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message: `This Direct Debit is ${mandate.status.toLowerCase()} and cannot be collected right now.`,
    context: { mandateId: mandate.id, status: mandate.status },
  });
}

function assertWithinCeiling(mandate: MandateRecord, amount: Money): void {
  if (!amount.isPositive) {
    throw new AppError({
      code: ErrorCode.INVALID_AMOUNT,
      message: 'A Direct Debit collection must be for more than nothing.',
    });
  }

  const ceiling = mandate.maxAmount ? fromStored(mandate.maxAmount) : null;
  if (!ceiling || amount.lessThanOrEqual(ceiling)) return;

  throw new AppError({
    code: ErrorCode.AMOUNT_ABOVE_MAXIMUM,
    message: `${mandate.merchantName} tried to take ${amount.format()}, which is more than the ${ceiling.format()} you agreed to. We have refused it.`,
    context: { mandateId: mandate.id, ceiling: ceiling.toString() },
  });
}
