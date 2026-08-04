import { Injectable } from '@nestjs/common';

import { ErrorCode, type FxQuoteRequest } from '@reliance/contracts';
import { Money, type CurrencyCode, type ExchangeRate } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromWire, toStored } from '../../common/money/money.codec.js';
import { AccountService, assertAccountUsable, type AccountRecord } from '../accounts/index.js';

import { priceByBuy, priceBySell, type FxPrice } from './fx-pricing.js';
import { FxQuoteStore, type FxQuoteRecord } from './fx-quote.store.js';
import { FxRateService } from './fx-rate.service.js';
import { FX_QUOTE_TTL_SECONDS } from './fx.constants.js';
import { rateToString } from './fx.mapper.js';

/**
 * Pricing a conversion and holding that price.
 *
 * The quote is where the bank makes its commitment, and the commitment is precise: this
 * customer, this pair, these two amounts, until this instant. Everything the execution
 * step needs is written down here, so that nothing about the price can be recomputed later
 * from a market that has since moved.
 *
 * The two accounts are both the customer's own. Converting into somebody else's wallet is
 * a payment, not an exchange, and conflating them would put a cross-currency transfer
 * behind an endpoint with no payee checks on it.
 */
@Injectable()
export class FxQuoteService {
  constructor(
    private readonly accounts: AccountService,
    private readonly rates: FxRateService,
    private readonly quotes: FxQuoteStore,
    private readonly clock: ClockService,
  ) {}

  /**
   * Prices a conversion and holds the price for {@link FX_QUOTE_TTL_SECONDS}.
   *
   * @throws {AppError} `SAME_ACCOUNT_TRANSFER` when both wallets are the same one.
   * @throws {AppError} `CURRENCY_MISMATCH` when the wallets share a currency.
   * @throws {AppError} `RATE_UNAVAILABLE` when the bank does not quote the pair.
   */
  async quote(input: { userId: string; request: FxQuoteRequest }): Promise<FxQuoteRecord> {
    const { from, to } = await this.resolveWallets(input);
    const customer = await this.rates.tierFor(input.userId);
    const pair = await this.rates.pairFor({
      from: from.currency as CurrencyCode,
      to: to.currency as CurrencyCode,
      customer,
    });

    const price = this.price(input.request, pair.mid.rate, pair.spreadBps, from);
    const now = this.clock.now();

    return this.quotes.insert({
      userId: input.userId,
      from: price.sellAmount.currency,
      to: price.buyAmount.currency,
      fromAccountId: from.id,
      toAccountId: to.id,
      sellAmount: toStored(price.sellAmount),
      buyAmount: toStored(price.buyAmount),
      rate: rateToString(price.customerRate),
      midRate: rateToString(price.midRate),
      spreadBps: price.spreadBps,
      spreadCost: toStored(price.spreadCost),
      fee: toStored(Money.zero(price.sellAmount.currency)),
      expiresAt: this.clock.inSeconds(FX_QUOTE_TTL_SECONDS),
      createdAt: now,
    });
  }

  /** Both wallets, checked for ownership, usability and being genuinely different. */
  private async resolveWallets(input: {
    userId: string;
    request: FxQuoteRequest;
  }): Promise<{ from: AccountRecord; to: AccountRecord }> {
    const { fromAccountId, toAccountId } = input.request;

    if (fromAccountId === toAccountId) {
      throw new AppError({
        code: ErrorCode.SAME_ACCOUNT_TRANSFER,
        message: 'Choose two different accounts to exchange between.',
      });
    }

    const from = await this.accounts.requireOwned(fromAccountId, input.userId);
    const to = await this.accounts.requireOwned(toAccountId, input.userId);
    assertAccountUsable(from);
    assertAccountUsable(to);

    if (from.currency === to.currency) {
      throw new AppError({
        code: ErrorCode.CURRENCY_MISMATCH,
        message: `Both accounts are held in ${from.currency}, so there is nothing to exchange. Use a transfer instead.`,
        context: { currency: from.currency },
      });
    }

    return { from, to };
  }

  /** Whichever end the customer fixed, priced off the same mid and the same spread. */
  private price(
    request: FxQuoteRequest,
    mid: ExchangeRate,
    spreadBps: number,
    from: AccountRecord,
  ): FxPrice {
    if (request.sellAmount) {
      const sellAmount = fromWire(request.sellAmount);
      assertMatchesWallet(sellAmount, from);
      return priceBySell({ sellAmount, mid, spreadBps });
    }

    if (!request.buyAmount) {
      throw AppError.validation(
        'Tell us either what you want to spend or what you want to receive.',
        [{ path: 'sellAmount', message: 'supply exactly one of sellAmount or buyAmount' }],
      );
    }

    return priceByBuy({ buyAmount: fromWire(request.buyAmount), mid, spreadBps });
  }
}

/** The amount being sold has to be in the currency of the wallet it is leaving. */
function assertMatchesWallet(amount: Money, from: AccountRecord): void {
  if (amount.currency === from.currency) return;

  throw new AppError({
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `That account is held in ${from.currency}, so the amount you are selling must be in ${from.currency} too.`,
    context: { accountCurrency: from.currency, amountCurrency: amount.currency },
  });
}
