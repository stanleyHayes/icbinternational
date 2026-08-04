import { Injectable, Logger } from '@nestjs/common';

import { AuthorisationStatus } from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { fromStored } from '../../../common/money/money.codec.js';
import {
  closeSettlementBatch,
  settlementBatchId,
  type SettlementBatch,
  type SettlementItem,
} from '../../../rails/card-network/index.js';
import { SETTLEMENT_BATCH_LIMIT } from '../card.constants.js';

import { AuthorisationStore, type AuthorisationRecord } from './authorisation.store.js';

/** The first batch of any given day. Re-cuts after a rejection take the next number. */
const FIRST_BATCH_OF_DAY = 1;

/**
 * Closing the day's card traffic into a settlement batch.
 *
 * Clearing and settlement are separate events and this is the second of them. Clearing is
 * per-payment and already happened at capture: the customer's balance moved and the
 * scheme's settlement position was credited, one item at a time. Settlement is the daily
 * net — the scheme and the bank agreeing one figure covering thousands of items, less the
 * interchange the issuer earned.
 *
 * **No customer balance moves here, and none should.** Every penny the customer owes was
 * booked at capture; a settlement run that touched a customer account would be charging
 * them a second time for the same coffee. What the batch does is mark the items as
 * settled and produce the totals a reconciliation clerk works from.
 */
@Injectable()
export class CardSettlementService {
  private readonly logger = new Logger(CardSettlementService.name);

  constructor(
    private readonly authorisations: AuthorisationStore,
    private readonly clock: ClockService,
  ) {}

  /**
   * Cuts a batch over everything cleared and not yet settled.
   *
   * @param currency The batch currency. One batch per currency, because a scheme settles
   *   each separately and netting across them would produce a figure nobody is owed.
   * @returns The closed batch, or null when there was nothing to settle. Null rather than
   *   an empty batch: an empty batch filed with the scheme is a reconciliation break, not
   *   a quiet day.
   */
  async settle(
    currency: CurrencyCode,
    sequence = FIRST_BATCH_OF_DAY,
  ): Promise<SettlementBatch | null> {
    const cutOffAt = this.clock.now();
    const cleared = await this.authorisations.listCleared({
      asOf: cutOffAt,
      limit: SETTLEMENT_BATCH_LIMIT,
    });

    const eligible = cleared.filter((record) => currencyOf(record) === currency);
    if (eligible.length === 0) return null;

    const batch = closeSettlementBatch({
      id: settlementBatchId(cutOffAt, sequence),
      items: eligible.map((record) => toItem(record)),
      currency,
      cutOffAt,
    });

    await this.markSettled(eligible, batch.id, cutOffAt);

    this.logger.log(
      `Settlement ${batch.id}: ${batch.items.length} items, ${batch.gross.format()} gross, ` +
        `${batch.interchange.format()} interchange, ${batch.net.format()} net`,
    );
    return batch;
  }

  /**
   * Marks each item settled, one write at a time.
   *
   * Conditional on the item still being `CAPTURED`, so an authorisation that a refund or
   * a chargeback moved while the batch was being cut is left out of it rather than
   * silently stamped with a batch it does not belong to.
   */
  private async markSettled(
    records: readonly AuthorisationRecord[],
    batchId: string,
    at: Date,
  ): Promise<void> {
    for (const record of records) {
      await this.authorisations.patch({
        authorisationId: record.id,
        fields: { settlementBatchId: batchId, settledAt: at },
        expectedStatuses: [AuthorisationStatus.CAPTURED],
      });
    }
  }
}

function toItem(record: AuthorisationRecord): SettlementItem {
  return {
    authorisationId: record.id,
    cardId: record.cardId,
    merchantId: record.merchantId,
    amount: fromStored(record.capturedAmount ?? record.amount),
    clearedAt: record.clearedAt ?? record.authorisedAt,
  };
}

function currencyOf(record: AuthorisationRecord): string {
  return (record.capturedAmount ?? record.amount).currency;
}
