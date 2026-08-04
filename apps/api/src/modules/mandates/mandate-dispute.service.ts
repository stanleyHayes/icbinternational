import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import { GUARANTEE_WINDOW_DAYS, MS_PER_DAY } from './mandate.constants.js';
import { MandatePoster } from './mandate.poster.js';
import { MandateStore, type MandateCollection, type MandateRecord } from './mandate.store.js';

/** Label the transaction runner logs a retried guarantee refund under. */
const REFUND_LABEL = 'mandate.guarantee-refund';

/** Raised inside the transaction when the collection was refunded by somebody else first. */
class AlreadyRefundedError extends Error {}

/**
 * The Direct Debit Guarantee.
 *
 * **The customer is refunded first and the merchant is argued with afterwards.** That is the
 * whole promise, and it is why this service does not gather evidence, open a case or wait
 * for anybody: a claim inside the indemnity window produces an immediate, full credit, in
 * the same transaction that records the claim. Whether the merchant was in the right is a
 * separate conversation the bank has on its own time, funded by its own nostro.
 *
 * **Refunded once.** The write matches only a collection that has not already been
 * refunded, so a customer pressing the button twice — or two operators acting on the same
 * complaint — produces one credit.
 *
 * The original collection is left standing rather than reversed. It happened; the customer's
 * statement is entitled to show both the collection and the refund, and a statement that
 * quietly erased the first would make the second unexplainable.
 */
@Injectable()
export class MandateDisputeService {
  private readonly logger = new Logger(MandateDisputeService.name);

  constructor(
    private readonly mandates: MandateStore,
    private readonly poster: MandatePoster,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Refunds a collection under the guarantee.
   *
   * @throws {AppError} `NOT_FOUND` when the mandate or the collection is unknown,
   *   `DISPUTE_WINDOW_CLOSED` past the indemnity period, and `DISPUTE_ALREADY_RAISED`
   *   when it has already been refunded.
   */
  async refund(input: {
    userId: string;
    mandateId: string;
    collectionEntryId: string;
    reason: string;
  }): Promise<MandateRecord> {
    const mandate = await this.require(input.userId, input.mandateId);
    const collection = this.collectionOf(mandate, input.collectionEntryId);

    assertRefundable(collection, this.poster.now());

    try {
      return await this.runner.run(
        async (session) => {
          const refundEntryId = await this.poster.refund({
            mandate,
            collectionEntryId: collection.journalEntryId,
            amount: fromStored(collection.amount),
            session,
          });

          const recorded = await this.mandates.recordRefund({
            mandateId: mandate.id,
            journalEntryId: collection.journalEntryId,
            refundEntryId,
            refundReason: input.reason,
            refundedAt: this.poster.now(),
            session,
          });

          // Losing the claim rolls the credit back with it, so a second claim on the same
          // collection cannot pay the customer twice for one disputed debit.
          if (!recorded) throw new AlreadyRefundedError(collection.journalEntryId);

          this.logger.log(
            `Guarantee refund ${refundEntryId} issued for mandate ${mandate.id}: ${input.reason}`,
          );
          return recorded;
        },
        { label: REFUND_LABEL },
      );
    } catch (error) {
      if (error instanceof AlreadyRefundedError) throw alreadyRefunded(input.collectionEntryId);
      throw error;
    }
  }

  private async require(userId: string, mandateId: string): Promise<MandateRecord> {
    const mandate = await this.mandates.findById(mandateId, userId);
    if (!mandate) throw AppError.notFound('That Direct Debit', mandateId);
    return mandate;
  }

  private collectionOf(mandate: MandateRecord, entryId: string): MandateCollection {
    const collection = mandate.collections.find(
      (candidate) => candidate.journalEntryId === entryId,
    );

    if (!collection) throw AppError.notFound('That Direct Debit collection', entryId);
    return collection;
  }
}

function assertRefundable(collection: MandateCollection, at: Date): void {
  if (collection.refundedAt) throw alreadyRefunded(collection.journalEntryId);

  const age = at.getTime() - collection.collectedAt.getTime();
  if (age <= GUARANTEE_WINDOW_DAYS * MS_PER_DAY) return;

  throw new AppError({
    code: ErrorCode.DISPUTE_WINDOW_CLOSED,
    message:
      'The Direct Debit Guarantee covers collections from the last thirteen months. Please contact us and we will look at this with you.',
    context: { collectedAt: collection.collectedAt.toISOString() },
  });
}

function alreadyRefunded(entryId: string): AppError {
  return AppError.conflict(
    ErrorCode.DISPUTE_ALREADY_RAISED,
    `We have already refunded that collection in full (${entryId}).`,
  );
}
