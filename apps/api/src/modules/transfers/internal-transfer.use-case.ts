import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode, type CreateTransferRequest } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import { TransferExecutionService, type AuthorisedTransfer } from './transfer-execution.service.js';
import { TRANSFER_TRANSACTION_LABEL } from './transfer.constants.js';
import { TransferStore, type TransferRecord } from './transfer.store.js';

/**
 * Internal transfer: one Mongo transaction, or nothing at all.
 *
 * This file owns two things and deliberately nothing else — the transaction boundary, and
 * what to do when two authorisations of the same quote race. The payment itself is
 * `TransferExecutionService`, which runs entirely inside the session opened here.
 *
 * Keeping the boundary separate matters because of how `TransactionRunner` behaves: it
 * re-runs the whole callback on a write conflict, which is *normal* under concurrent
 * transfers from one account rather than exceptional. Everything inside the callback must
 * therefore be safe to run twice — it reads inside the session, writes nothing outside it,
 * and mutates no state that outlives the transaction.
 */
@Injectable()
export class InternalTransferUseCase {
  private readonly logger = new Logger(InternalTransferUseCase.name);

  constructor(
    private readonly execution: TransferExecutionService,
    private readonly transfers: TransferStore,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Sends the money.
   *
   * @throws {AppError} `QUOTE_EXPIRED`, `QUOTE_NOT_FOUND`, `SAME_ACCOUNT_TRANSFER`,
   *   `ACCOUNT_FROZEN`, `ACCOUNT_CLOSED`, `INSUFFICIENT_FUNDS`, `LIMIT_EXCEEDED`,
   *   `BENEFICIARY_COOLING_OFF`, `STEP_UP_REQUIRED`, `CURRENCY_MISMATCH` or
   *   `FEATURE_DISABLED`.
   */
  async execute(input: AuthorisedTransfer): Promise<TransferRecord> {
    assertNotScheduled(input.request);

    try {
      return await this.runner.run((session) => this.execution.run(input, session), {
        label: TRANSFER_TRANSACTION_LABEL.EXECUTE,
      });
    } catch (error) {
      return this.recoverFromDuplicate(input.request.quoteId, error);
    }
  }

  /**
   * Turns a lost race into the winner's transfer.
   *
   * Two authorisations of one quote can both pass the replay check microseconds apart; the
   * unique index on `quoteId` then rejects the second insert and aborts its transaction,
   * unwinding its posting with it. Nothing of the loser survives, so re-reading the quote
   * yields the winner's transfer — which is exactly what an idempotent execution should
   * return. That the money moved once was never in doubt; this only decides whether the
   * second caller sees an error or the answer.
   */
  private async recoverFromDuplicate(quoteId: string, error: unknown): Promise<TransferRecord> {
    if (!isDuplicateQuoteError(error)) throw error;

    const winner = await this.transfers.findByQuote(quoteId);
    if (!winner) throw error;

    this.logger.warn(`Lost the race on quote ${quoteId}; returning transfer ${winner.id}`);
    return winner;
  }
}

const DUPLICATE_KEY_CODE = 11_000;
const QUOTE_FIELD = 'quoteId';

/** Narrows a driver error to "the unique index on `quoteId` rejected this insert". */
function isDuplicateQuoteError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ((error as { code?: unknown }).code !== DUPLICATE_KEY_CODE) return false;

  const keyPattern: unknown = (error as { keyPattern?: unknown }).keyPattern;
  if (typeof keyPattern === 'object' && keyPattern !== null) return QUOTE_FIELD in keyPattern;

  // Some driver paths report the duplicate without a key pattern; the message names the
  // index. Treating an unrecognised duplicate as fatal is the safe default.
  return String((error as { message?: unknown }).message ?? '').includes(QUOTE_FIELD);
}

/**
 * A future-dated instruction is refused rather than quietly sent today.
 *
 * `executeOn` creates a `SCHEDULED` transfer, and a scheduled transfer only means anything
 * if something runs it — the standing-order engine, D-06. Accepting the date and paying
 * immediately would send money on a day the customer did not choose; accepting it and
 * storing a `SCHEDULED` row nothing executes would strand the payment forever. Refusing is
 * the only honest answer until the runner exists.
 */
function assertNotScheduled(request: CreateTransferRequest): void {
  if (!request.executeOn) return;

  throw new AppError({
    code: ErrorCode.FEATURE_DISABLED,
    message: 'Scheduling a payment for a future date is not available yet.',
    context: { executeOn: request.executeOn },
  });
}
