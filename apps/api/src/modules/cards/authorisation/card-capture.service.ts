import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { AuthorisationStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { fromStored, toStored } from '../../../common/money/money.codec.js';
import { TransactionRunner } from '../../../database/transaction.runner.js';
import { HoldCaptureService } from '../../holds/index.js';
import { CARD_CAPTURE_REFERENCE_PREFIX, CARD_TRANSACTION_LABEL } from '../card.constants.js';
import { authorisationNotOpen } from '../card.errors.js';

import { AuthorisationStore, type AuthorisationRecord } from './authorisation.store.js';
import { CardTransactionLinker } from './card-transaction.linker.js';

/** Statuses a capture may act on. Everything else has already been settled or undone. */
const CAPTURABLE: readonly AuthorisationStatus[] = [AuthorisationStatus.APPROVED];

/**
 * Turning an authorisation into money that has actually moved.
 *
 * Capture is presentment: the merchant telling the scheme what they are claiming, which
 * may be less than they authorised. Four things happen and they are one transaction —
 * the hold is captured into a posting, the full reserve is returned so any unspent
 * difference becomes spendable, the statement row is projected, and the authorisation is
 * marked `CAPTURED` with the clearing reference the acquirer quoted.
 *
 * **Exactly once.** The status guard on the authorisation and the hold's own conditional
 * resolve are two independent locks on the same event; whichever a racing second capture
 * hits, it is refused with nothing having moved. Even a retry with the same reference is
 * caught a third time by the ledger's unique index on `reference`.
 */
@Injectable()
export class CardCaptureService {
  private readonly logger = new Logger(CardCaptureService.name);

  constructor(
    private readonly authorisations: AuthorisationStore,
    private readonly captures: HoldCaptureService,
    private readonly linker: CardTransactionLinker,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Captures an authorisation, in full or in part.
   *
   * @param input.amount What the merchant is actually claiming. Defaults to the whole
   *   authorisation; more than it is refused, because the customer only ever agreed to
   *   the amount that was authorised.
   * @param input.clearingReference The acquirer's presentment reference, kept so a
   *   statement line can be traced back into the scheme's own files.
   * @throws {AppError} `CONFLICT` when the authorisation is not open; `AMOUNT_ABOVE_MAXIMUM`
   *   when the claim exceeds the approval.
   */
  async capture(input: {
    authorisationId: string;
    amount?: Money;
    clearingReference: string;
  }): Promise<AuthorisationRecord> {
    return this.runner.run((session) => this.captureWithin(input, session), {
      label: CARD_TRANSACTION_LABEL.CAPTURE,
    });
  }

  private async captureWithin(
    input: { authorisationId: string; amount?: Money; clearingReference: string },
    session: ClientSession,
  ): Promise<AuthorisationRecord> {
    const record = await this.requireCapturable(input.authorisationId, session);
    const claimed = input.amount ?? fromStored(record.amount);

    if (!record.holdId) {
      throw authorisationNotOpen({
        authorisationId: record.id,
        message: 'This payment has no funds reserved against it and cannot be claimed.',
      });
    }

    const hold = await this.captures.capture({
      holdId: record.holdId,
      amount: claimed,
      reference: `${CARD_CAPTURE_REFERENCE_PREFIX}${record.id}`,
      description: record.merchantName,
      session,
    });

    return this.recordCapture({
      record,
      claimed,
      hold,
      clearingReference: input.clearingReference,
      session,
    });
  }

  /** Links the posting to a statement row and closes the authorisation. */
  private async recordCapture(input: {
    record: AuthorisationRecord;
    claimed: Money;
    hold: { capturedEntryId: string | null; resolvedAt: Date | null };
    clearingReference: string;
    session: ClientSession;
  }): Promise<AuthorisationRecord> {
    const { record, hold, session } = input;
    const journalEntryId = hold.capturedEntryId;

    const transactionId = journalEntryId
      ? await this.linker.link({ journalEntryId, accountId: record.accountId, session })
      : null;

    const capturedAt = hold.resolvedAt ?? record.authorisedAt;
    const captured = await this.authorisations.patch({
      authorisationId: record.id,
      fields: {
        status: AuthorisationStatus.CAPTURED,
        capturedAmount: toStored(input.claimed),
        clearingReference: input.clearingReference,
        journalEntryId,
        transactionId,
        capturedAt,
        clearedAt: capturedAt,
      },
      expectedStatuses: CAPTURABLE,
      session,
    });

    if (!captured) {
      throw authorisationNotOpen({
        authorisationId: record.id,
        message: 'This payment was already claimed by the merchant.',
      });
    }

    this.logger.log(
      `Captured ${input.claimed.format()} of ${fromStored(record.amount).format()} on ${record.id}`,
    );
    return captured;
  }

  private async requireCapturable(
    authorisationId: string,
    session: ClientSession,
  ): Promise<AuthorisationRecord> {
    const record = await this.authorisations.findById(authorisationId, session);
    if (!record) {
      throw authorisationNotOpen({
        authorisationId,
        message: 'We could not find that card payment.',
      });
    }

    if (record.status !== AuthorisationStatus.APPROVED) {
      throw authorisationNotOpen({
        authorisationId,
        message: `This payment has already been ${record.status.toLowerCase()}.`,
      });
    }

    return record;
  }
}
