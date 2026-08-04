import { Injectable } from '@nestjs/common';

import { type FxQuoteRequest } from '@reliance/contracts';

import { FxExecutionService, FxQuoteService, type FxQuoteRecord } from '../fx/index.js';

/**
 * Moving value between two of the customer's own wallets.
 *
 * This is the *bank's* path, not the customer's. A customer quotes, reads the figures and
 * then converts, in two calls, because that is what makes the price a commitment they saw
 * before they agreed to it. The bank's own flows — a residual balance swept out of a wallet
 * being closed, a scheduled top-up of a travel wallet — have no human at the keyboard to
 * show a rate to, and the two steps collapse into one.
 *
 * The collapse is in the *sequencing only*. The same quote is written, the same window
 * applies, the same journal entry is booked and the same spread is recognised: an internal
 * conversion is auditable in exactly the way a customer's is, and priced identically. What
 * it does not get is a moment to think.
 */
@Injectable()
export class WalletConversionService {
  constructor(
    private readonly quotes: FxQuoteService,
    private readonly conversions: FxExecutionService,
  ) {}

  /**
   * Quotes and immediately executes a conversion between two of the customer's wallets.
   *
   * @throws {AppError} everything {@link FxQuoteService.quote} and
   *   {@link FxExecutionService.execute} throw — an unquotable pair, a wallet that is not
   *   theirs, a frozen wallet, insufficient funds.
   */
  async convert(input: { userId: string; request: FxQuoteRequest }): Promise<FxQuoteRecord> {
    const quote = await this.quotes.quote(input);
    return this.conversions.execute({ userId: input.userId, quoteId: quote.id });
  }
}
