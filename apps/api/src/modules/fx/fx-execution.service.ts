import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { BalanceService } from '../holds/index.js';

import { FxConversionPoster } from './fx-conversion.poster.js';
import { FxQuoteStore, type FxQuoteRecord } from './fx-quote.store.js';

/** Label the transaction runner logs a retried conversion under. */
const CONVERSION_LABEL = 'fx.convert';

/** Raised inside the transaction when another request claimed the quote first. */
class QuoteAlreadySpentError extends Error {}

/**
 * Executing a quote.
 *
 * **An expired quote does not execute.** It is not repriced, not executed "close enough",
 * and not silently rolled to the current market. The customer saw a rate and either gets
 * that rate or is told to ask again — anything else is the bank changing the price after
 * the customer agreed to it, which is the single thing a quote exists to prevent.
 *
 * **A quote executes once.** The window check and the claim are one conditional write
 * inside the transaction that books the money, so two authorisations of one quote cannot
 * both succeed. The loser does not fail: it finds the conversion the winner booked and
 * returns it, because a customer who tapped twice wants one conversion and one answer, not
 * an error about a race they did not know they were in.
 *
 * **Funds are checked inside the transaction.** A check taken before the transaction is a
 * check against a balance that no longer exists by the time the debit lands.
 */
@Injectable()
export class FxExecutionService {
  constructor(
    private readonly quotes: FxQuoteStore,
    private readonly poster: FxConversionPoster,
    private readonly balances: BalanceService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Converts at the quoted rate.
   *
   * @throws {AppError} `QUOTE_NOT_FOUND` when the quote is missing or another customer's.
   * @throws {AppError} `QUOTE_EXPIRED` when the window has closed.
   * @throws {AppError} `INSUFFICIENT_FUNDS` when the wallet cannot cover the sale.
   */
  async execute(input: { userId: string; quoteId: string }): Promise<FxQuoteRecord> {
    const held = await this.quotes.findById(input.quoteId, input.userId);
    if (!held) throw quoteNotFound(input.quoteId);
    if (held.conversionId) return held;

    assertLive(held, this.poster.now());

    try {
      return await this.runner.run(async (session) => this.convert(held, session), {
        label: CONVERSION_LABEL,
      });
    } catch (error) {
      if (error instanceof QuoteAlreadySpentError) return this.replayOf(held);
      throw error;
    }
  }

  /**
   * The transactional body: check, book, claim — and abandon everything if the claim fails.
   *
   * The claim comes last because it carries the journal entry id, and a quote may not point
   * at an entry that does not exist. Losing the claim throws, which rolls the whole
   * transaction back: the posting written moments earlier is undone with it, so the loser
   * leaves no trace at all rather than a stray entry somebody has to reverse.
   */
  private async convert(quote: FxQuoteRecord, session: ClientSession): Promise<FxQuoteRecord> {
    await this.balances.assertSufficientFunds(
      quote.fromAccountId,
      fromStored(quote.sellAmount),
      session,
    );

    const booked = await this.poster.post(quote, session);
    assertLive(quote, booked.at);

    const consumed = await this.quotes.consume({
      quoteId: quote.id,
      userId: quote.userId,
      conversionId: booked.conversionId,
      journalEntryId: booked.entryId,
      at: booked.at,
      session,
    });

    if (!consumed) throw new QuoteAlreadySpentError(quote.id);
    return consumed;
  }

  /** The conversion the winning request booked. */
  private async replayOf(quote: FxQuoteRecord): Promise<FxQuoteRecord> {
    const settled = await this.quotes.findById(quote.id, quote.userId);
    if (settled?.conversionId) return settled;

    // The claim failed and no conversion exists: the window closed between the funds
    // check and the write. Saying so is more useful than a generic conflict.
    throw quoteExpired(quote.id);
  }
}

/** Refuses a quote whose window has closed. */
export function assertLive(quote: FxQuoteRecord, at: Date): void {
  if (quote.expiresAt.getTime() > at.getTime()) return;
  throw quoteExpired(quote.id);
}

export function quoteExpired(quoteId: string): AppError {
  return new AppError({
    code: ErrorCode.QUOTE_EXPIRED,
    message:
      'That exchange rate is no longer available. Ask for a new quote and we will price it again.',
    context: { quoteId },
  });
}

export function quoteNotFound(quoteId: string): AppError {
  return new AppError({
    code: ErrorCode.QUOTE_NOT_FOUND,
    message: 'We could not find that quote.',
    context: { quoteId },
  });
}
