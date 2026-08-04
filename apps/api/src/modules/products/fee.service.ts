import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type FeeKind, type Product } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';

import {
  computeFee,
  FeeWaiver,
  findFeeEntry,
  unpricedQuote,
  type FeeQuote,
} from './fee-calculator.js';
import { monthWindow, retentionEnd } from './period-window.js';
import { DEFAULT_TIME_ZONE } from './product.constants.js';
import { UsageCounterRepository } from './usage-counter.repository.js';

/** Everything needed to price one chargeable event for one account. */
export interface FeeRequest {
  readonly accountId: string;
  readonly product: Product;
  readonly kind: FeeKind;
  /** Amount a proportional fee applies to. Pass zero for a flat-only fee. */
  readonly amount: Money;
  /** The customer's pricing tier, if they are on one. */
  readonly tier?: string | null;
  /** IANA zone the free allowance's calendar month is measured in. */
  readonly timeZone?: string;
}

/**
 * Resolves and charges product fees.
 *
 * The arithmetic lives in `fee-calculator.ts`; this service exists to supply the one thing
 * arithmetic cannot know — how much of the free allowance the account has already used.
 * Quoting and recording are separate calls on purpose: a fee is quoted while a payment is
 * still being validated and may never be charged, and a quote that silently consumed an
 * allowance would let an abandoned transfer cost the customer a free ATM withdrawal.
 */
@Injectable()
export class FeeService {
  constructor(
    private readonly counters: UsageCounterRepository,
    private readonly clock: ClockService,
  ) {}

  /** Counter scope for a fee's monthly allowance. Namespaced so it cannot collide with a limit. */
  static scopeFor(kind: FeeKind): string {
    return `${FEE_SCOPE_PREFIX}${kind}`;
  }

  /** Prices an event without charging it or consuming any allowance. */
  async quote(request: FeeRequest, session?: ClientSession): Promise<FeeQuote> {
    const entry = findFeeEntry(request.product, request.kind);
    if (!entry) return unpricedQuote(request.kind, request.amount.currency);

    const usedThisMonth = await this.usedThisMonth(request, session);

    return computeFee({
      entry,
      amount: request.amount,
      usedThisMonth,
      tier: request.tier ?? null,
    });
  }

  /**
   * Prices an event and consumes one use of its allowance.
   *
   * Must be called with the session of the transaction that books the fee. If the posting
   * rolls back, so does the counter — otherwise a failed withdrawal would still burn a
   * free one.
   */
  async charge(request: FeeRequest, session?: ClientSession): Promise<FeeQuote> {
    const quote = await this.quote(request, session);
    if (quote.waivedBy !== FeeWaiver.NOT_PRICED) {
      await this.consumeAllowance(request, quote, session);
    }

    return quote;
  }

  /** Records one use of the fee's monthly allowance, inside the caller's transaction. */
  private async consumeAllowance(
    request: FeeRequest,
    quote: FeeQuote,
    session?: ClientSession,
  ): Promise<void> {
    const window = monthWindow(this.clock.now(), request.timeZone ?? DEFAULT_TIME_ZONE);

    await this.counters.accumulate(
      {
        accountId: request.accountId,
        scope: FeeService.scopeFor(request.kind),
        periodKey: window.key,
      },
      quote.fee,
      { resetsAt: window.resetsAt, expiresAt: retentionEnd(window.resetsAt) },
      session,
    );
  }

  private async usedThisMonth(request: FeeRequest, session?: ClientSession): Promise<number> {
    const window = monthWindow(this.clock.now(), request.timeZone ?? DEFAULT_TIME_ZONE);

    const counters = await this.counters.findWindows(
      request.accountId,
      FeeService.scopeFor(request.kind),
      [window.key],
      session,
    );

    return counters.get(window.key)?.count ?? 0;
  }
}

const FEE_SCOPE_PREFIX = 'fee:';
