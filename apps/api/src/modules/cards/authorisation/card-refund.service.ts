import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { AuthorisationStatus, ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { fromStored, fromStoredOrZero, toStored } from '../../../common/money/money.codec.js';
import { TransactionRunner } from '../../../database/transaction.runner.js';
import { PostingService } from '../../ledger/posting.service.js';
import { CARD_REFUND_REFERENCE_PREFIX, CARD_TRANSACTION_LABEL } from '../card.constants.js';
import { authorisationNotOpen } from '../card.errors.js';

import { AuthorisationStore, type AuthorisationRecord } from './authorisation.store.js';
import { cardRefundEntry } from './card-refund-entry.js';

/** Separator between the refund prefix and the sequence, keeping references unique. */
const REFERENCE_SEPARATOR = '-';

/**
 * Money coming back from a merchant.
 *
 * A refund is booked as its own entry rather than as a reversal of the purchase, and the
 * distinction is not pedantry. The purchase happened; it belongs on the statement and
 * stays there. What is happening now is a separate movement in the opposite direction,
 * frequently for part of the original and frequently weeks later — none of which a
 * reversal can express.
 *
 * Partial and repeat refunds are both normal. The running total is held on the
 * authorisation so the sum can never exceed what was taken, which is the one rule a
 * refund path has to enforce: a merchant returning more than they charged is either a
 * mistake or a way to withdraw cash through a card terminal.
 */
@Injectable()
export class CardRefundService {
  private readonly logger = new Logger(CardRefundService.name);

  constructor(
    private readonly authorisations: AuthorisationStore,
    private readonly postings: PostingService,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Credits a refund back to the card's account.
   *
   * @param input.amount What the merchant is returning. Defaults to everything they took.
   * @throws {AppError} `CONFLICT` when the payment was never captured;
   *   `AMOUNT_ABOVE_MAXIMUM` when the refund would exceed what was charged.
   */
  async refund(input: { authorisationId: string; amount?: Money }): Promise<AuthorisationRecord> {
    return this.runner.run((session) => this.refundWithin(input, session), {
      label: CARD_TRANSACTION_LABEL.REFUND,
    });
  }

  private async refundWithin(
    input: { authorisationId: string; amount?: Money },
    session: ClientSession,
  ): Promise<AuthorisationRecord> {
    const record = await this.requireCaptured(input.authorisationId, session);
    const charged = fromStored(record.capturedAmount ?? record.amount);
    const alreadyBack = fromStoredOrZero(record.refundedAmount, charged.currency);

    const amount = input.amount ?? charged.minus(alreadyBack);
    assertRefundable({ record, amount, charged, alreadyBack });

    const entry = await this.postings.post(
      cardRefundEntry({
        reference: referenceFor(record, alreadyBack.isZero),
        accountId: record.accountId,
        amount,
        description: `Refund — ${record.merchantName}`,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: { authorisationId: record.id, merchantId: record.merchantId },
      }),
      session,
    );

    return this.record({
      record,
      amount,
      total: alreadyBack.plus(amount),
      entryId: entry.id,
      session,
    });
  }

  private async record(input: {
    record: AuthorisationRecord;
    amount: Money;
    total: Money;
    entryId: string;
    session: ClientSession;
  }): Promise<AuthorisationRecord> {
    const patched = await this.authorisations.patch({
      authorisationId: input.record.id,
      fields: { refundedAmount: toStored(input.total) },
      expectedStatuses: [AuthorisationStatus.CAPTURED],
      session: input.session,
    });

    if (!patched) {
      throw authorisationNotOpen({
        authorisationId: input.record.id,
        message: 'This payment changed while the refund was being applied. Please try again.',
      });
    }

    this.logger.log(
      `Refunded ${input.amount.format()} against ${input.record.id} (entry ${input.entryId})`,
    );
    return patched;
  }

  private async requireCaptured(
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

    if (record.status !== AuthorisationStatus.CAPTURED) {
      throw authorisationNotOpen({
        authorisationId,
        message:
          'This payment has not been taken from your account yet, so there is nothing to refund. It will be released on its own.',
      });
    }

    return record;
  }
}

/**
 * A unique journal reference per refund.
 *
 * The first refund against a payment takes the plain reference, so the common case reads
 * cleanly in a ledger search and is idempotent on a retry. Subsequent partial refunds
 * append the running total, which is monotonic and therefore never collides — while still
 * making a repeat of the *same* partial refund hit the ledger's unique index rather than
 * crediting twice.
 */
function referenceFor(record: AuthorisationRecord, isFirst: boolean): string {
  const base = `${CARD_REFUND_REFERENCE_PREFIX}${record.id}`;
  if (isFirst) return base;

  return `${base}${REFERENCE_SEPARATOR}${record.refundedAmount?.amount ?? '0'}`;
}

function assertRefundable(input: {
  record: AuthorisationRecord;
  amount: Money;
  charged: Money;
  alreadyBack: Money;
}): void {
  if (!input.amount.isPositive) {
    throw new AppError({
      code: ErrorCode.INVALID_AMOUNT,
      message: 'A refund must be for a positive amount.',
      context: { authorisationId: input.record.id },
    });
  }

  const total = input.alreadyBack.plus(input.amount);
  if (total.greaterThan(input.charged)) {
    throw new AppError({
      code: ErrorCode.AMOUNT_ABOVE_MAXIMUM,
      message: `This refund is more than the ${input.charged.format()} that was charged.`,
      context: {
        authorisationId: input.record.id,
        charged: input.charged.toJSON(),
        requested: input.amount.toJSON(),
      },
    });
  }
}

/** Zero in the authorisation's own currency, for callers reasoning about headroom. */
export function refundHeadroom(record: AuthorisationRecord): Money {
  const charged = fromStored(record.capturedAmount ?? record.amount);
  return charged.minus(fromStoredOrZero(record.refundedAmount, charged.currency));
}

/** Whether anything is still refundable against this payment. */
export function isFullyRefunded(record: AuthorisationRecord): boolean {
  return refundHeadroom(record).equals(Money.zero(fromStored(record.amount).currency));
}
