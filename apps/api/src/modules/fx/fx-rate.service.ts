import { Injectable } from '@nestjs/common';

import {
  CustomerSegment,
  ErrorCode,
  type FxBoard,
  type FxRate,
  type Paginated,
} from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { buildPage } from '../../common/pagination/cursor.js';
import { AppConfigService } from '../../config/config.service.js';
import { toIso } from '../accounts/index.js';
import { UsersService } from '../auth/users/index.js';

import { spreadBpsFor, type CustomerTier } from './fx-spread.js';
import { toContractRate } from './fx.mapper.js';
import { RateProviderPort, type MidQuote } from './rate-feed/rate-provider.port.js';

/** What an unauthenticated caller is quoted: the standard retail spread, no discounts. */
const STANDARD_TIER: CustomerTier = { segment: CustomerSegment.PERSONAL, kycTier: 0 };

/**
 * The rate board.
 *
 * Every rate the bank publishes carries three numbers, not one: the mid-market level, the
 * spread in basis points, and the bid and ask that fall out of them. Publishing only the
 * customer rate would let the margin move without anything on the screen changing, and a
 * customer who cannot see the mid cannot tell a market move from a repricing.
 *
 * The spread shown is the spread *that customer* would get. A business customer sees their
 * own tighter board rather than a headline rate they will not be offered when they come to
 * trade, because a rate you are not eligible for is not information, it is advertising.
 */
@Injectable()
export class FxRateService {
  constructor(
    private readonly rates: RateProviderPort,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {}

  /** The customer's own tier, or the standard retail tier when nobody is signed in. */
  async tierFor(userId: string | null): Promise<CustomerTier> {
    if (!userId) return STANDARD_TIER;

    const user = await this.users.requireById(userId);
    return { segment: user.segment, kycTier: user.kycTier };
  }

  /** The full board against the bank's base currency. */
  async board(userId: string | null): Promise<FxBoard> {
    const base = this.config.bank.baseCurrency;
    const tier = await this.tierFor(userId);
    const quotes = await this.rates.board(base);

    return {
      base,
      rates: quotes.map((quote) => this.present(quote, tier)),
      asOf: toIso(this.clock.now()),
    };
  }

  /** The board as a list, optionally narrowed to one quote currency. */
  async list(userId: string | null, to?: CurrencyCode): Promise<Paginated<FxRate>> {
    const board = await this.board(userId);
    const rates = to ? board.rates.filter((rate) => rate.to === to) : board.rates;

    return buildPage({
      records: rates,
      limit: Math.max(rates.length, 1),
      toCursor: (rate) => ({ sortValue: rate.asOf, id: `${rate.from}${rate.to}` }),
      total: rates.length,
    });
  }

  /**
   * One pair, priced for one customer.
   *
   * @throws {AppError} `RATE_UNAVAILABLE` when the bank does not quote the pair.
   */
  async pairFor(input: {
    from: CurrencyCode;
    to: CurrencyCode;
    customer: CustomerTier;
  }): Promise<{ mid: MidQuote; spreadBps: number }> {
    const mid = await this.rates.midFor(input.from, input.to);
    if (!mid) throw rateUnavailable(input.from, input.to);

    return { mid, spreadBps: spreadBpsFor(input) };
  }

  private present(quote: MidQuote, customer: CustomerTier): FxRate {
    return toContractRate(
      quote,
      spreadBpsFor({ from: quote.rate.from, to: quote.rate.to, customer }),
    );
  }
}

/** The one way this lane says "we cannot price that", so the copy is written once. */
export function rateUnavailable(from: string, to: string): AppError {
  return new AppError({
    code: ErrorCode.RATE_UNAVAILABLE,
    message: `We are not quoting ${from} to ${to} at the moment. Please try again shortly.`,
    context: { from, to },
  });
}
