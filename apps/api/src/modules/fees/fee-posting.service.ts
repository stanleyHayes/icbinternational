import { Injectable, Logger, Optional } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, type FeeKind } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { entries } from '../../domain/ledger/index.js';
import { MAX_REFERENCE_LENGTH } from '../ledger/ledger.constants.js';
import { PostingService } from '../ledger/posting.service.js';
import { type FeeQuote } from '../products/index.js';
import { TransactionProjectorService } from '../transactions/transaction-projector.service.js';

import { FeeChargeStore, type FeeChargeRecord } from './fee-charge.store.js';
import {
  FEE_REFERENCE_PREFIX,
  FEE_TRANSACTION_LABEL,
  type FeeChargeSource,
} from './fees.constants.js';
import { applyProRata, type ProRata } from './maintenance-period.js';

/** Everything the write half needs to book one fee, after the account is resolved. */
export interface FeeBookingInput {
  readonly accountId: string;
  readonly kind: FeeKind;
  readonly chargeKey: string;
  readonly periodKey: string | null;
  readonly source: FeeChargeSource;
  readonly sourceId: string | null;
  /** Null to fall back to the schedule entry's own label. */
  readonly description: string | null;
  /** Set for period fees charged for part of a month. */
  readonly proRata?: ProRata;
}

/**
 * The write half of fee charging: price, post, project, record — one transaction.
 *
 * Pricing arrives as a callback because allowance consumption must happen inside the
 * booking transaction (`FeeService.charge` says so in its own docs): a rolled-back
 * posting must roll back the free-allowance counter with it, or a failed charge would
 * still burn a free use.
 *
 * The money, the statement line and the charge record commit together or not at all.
 * A race on `chargeKey` aborts the loser's whole transaction — posting included — and
 * the loser re-reads the winner's record, which is exactly what an idempotent charge
 * should return.
 */
@Injectable()
export class FeePostingService {
  private readonly logger = new Logger(FeePostingService.name);

  constructor(
    private readonly postings: PostingService,
    private readonly charges: FeeChargeStore,
    private readonly runner: TransactionRunner,
    private readonly clock: ClockService,
    @Optional() private readonly projector?: TransactionProjectorService,
  ) {}

  /** The charge already recorded under `chargeKey`, or null. The replay lookup. */
  async findByChargeKey(chargeKey: string): Promise<FeeChargeRecord | null> {
    return this.charges.findByChargeKey(chargeKey);
  }

  /**
   * Books one fee end to end.
   *
   * @param input What to charge, and the dedupe key to charge it under.
   * @param price Prices the fee inside the booking transaction, consuming allowance.
   */
  async book(
    input: FeeBookingInput,
    price: (session: ClientSession) => Promise<FeeQuote>,
  ): Promise<FeeChargeRecord> {
    try {
      return await this.runner.run(
        async (session) => {
          const quote = await price(session);
          const fee = applyProRata(quote.fee, input.proRata);
          const description = input.description ?? quote.label;
          const journalEntryId = await this.postIfCharged(input, quote, fee, description, session);

          return this.charges.insert(
            {
              accountId: input.accountId,
              kind: input.kind,
              chargeKey: input.chargeKey,
              periodKey: input.periodKey,
              amount: toStored(fee),
              waivedBy: quote.waivedBy,
              journalEntryId,
              source: input.source,
              sourceId: input.sourceId,
              description,
              chargedAt: this.clock.now(),
            },
            session,
          );
        },
        { label: FEE_TRANSACTION_LABEL },
      );
    } catch (error) {
      return this.recoverFromDuplicate(input.chargeKey, error);
    }
  }

  /**
   * The journal entry, when money actually moves.
   *
   * A waived or zero fee books nothing — a zero-amount posting is rejected by the
   * domain, and a non-event has no place in the system of record. The reference derives
   * from the charge key, so the ledger's unique index is a second, independent
   * guarantee that the same fee never lands twice.
   */
  private async postIfCharged(
    input: FeeBookingInput,
    quote: FeeQuote,
    fee: Money,
    description: string,
    session: ClientSession,
  ): Promise<string | null> {
    if (quote.waivedBy !== null || !fee.isPositive) return null;

    const entry = await this.postings.post(
      entries.fee({
        reference: referenceFor(input.chargeKey),
        accountId: input.accountId,
        amount: fee,
        description,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: { feeKind: input.kind, chargeKey: input.chargeKey },
      }),
      session,
    );

    await this.projector?.project(entry, session);
    return entry.id;
  }

  /**
   * Turns a lost race into the winner's record.
   *
   * Not attempted inside the transaction — by the time the duplicate-key surfaces, that
   * transaction is already doomed, so the re-read happens after, outside it.
   */
  private async recoverFromDuplicate(chargeKey: string, error: unknown): Promise<FeeChargeRecord> {
    if (!isDuplicateKeyError(error)) throw error;

    const winner = await this.charges.findByChargeKey(chargeKey);
    if (!winner) throw error;

    this.logger.warn(`Lost the race to charge ${chargeKey}; reusing ${winner.id}`);
    return winner;
  }
}

/** The journal reference for a charge, validated against the ledger's length limit. */
function referenceFor(chargeKey: string): string {
  const reference = `${FEE_REFERENCE_PREFIX}${chargeKey}`;

  if (reference.length > MAX_REFERENCE_LENGTH) {
    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: `Fee charge key produces a journal reference over ${MAX_REFERENCE_LENGTH} characters`,
      context: { chargeKey },
    });
  }

  return reference;
}

const DUPLICATE_KEY_CODE = 11_000;

/** Narrows a driver error to "the unique index rejected this insert". */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}
