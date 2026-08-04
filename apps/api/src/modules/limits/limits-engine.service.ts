import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type KycTier, type LimitMatrix, type LimitUsage } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { LimitsService, type LimitScope, type LimitWindowUsage } from '../products/index.js';

import { LimitChannel } from './limit-channel.js';
import { resolveEffectiveMatrix } from './limit-override.js';
import { LimitOverrideRepository } from './limit-override.repository.js';

/** Everything the engine needs to evaluate one movement against its limits. */
export interface LimitCheckInput {
  readonly accountId: string;
  readonly scope: LimitScope;
  /** The limit matrix from the product version the account was opened on. */
  readonly matrix: LimitMatrix;
  /** The customer's current verification tier, read fresh — never a snapshot. */
  readonly kycTier: KycTier;
  readonly currency: CurrencyCode;
  /** How the movement arrives. Omit when the movement has no meaningful channel. */
  readonly channel?: LimitChannel;
  /** IANA zone whose midnight resets the daily counters. */
  readonly timeZone?: string;
}

/**
 * The limits engine: the single place a movement of money asks "may I, and how much
 * room is left".
 *
 * Three things bind every movement, tightest first:
 *
 * 1. **The product matrix** — the terms the account was sold, versioned and immutable.
 * 2. **The KYC tier cap** — what the customer's verification level allows, looked up on
 *    every check so an upgrade lifts limits the moment the decision lands.
 * 3. **Staff overrides** — temporary, expiring deviations that replace individual caps.
 *
 * Window arithmetic, counters and the `LIMIT_EXCEEDED` rendering are delegated to the
 * products module's `LimitsService` — the engine resolves *which* matrix applies, that
 * service enforces it. Counters are shared across channels on purpose: a KYC cap binds
 * the customer, so their Tuesday is one Tuesday however many apps they spent it through.
 */
@Injectable()
export class LimitsEngineService {
  constructor(
    private readonly limits: LimitsService,
    private readonly overrides: LimitOverrideRepository,
    private readonly clock: ClockService,
  ) {}

  /**
   * Throws `LIMIT_EXCEEDED` — carrying the remaining allowance and the reset instant —
   * when `amount` would not fit, and returns the windows when it would.
   */
  async check(
    input: LimitCheckInput,
    amount: Money,
    session?: ClientSession,
  ): Promise<LimitWindowUsage[]> {
    const matrix = await this.effectiveMatrix(input, session);
    return this.limits.check(this.toQuery(input, matrix), amount, session);
  }

  /**
   * Consumes allowance for a movement that is actually happening.
   *
   * Pass the session of the booking transaction so the counter rolls back with it.
   */
  async record(input: LimitCheckInput, amount: Money, session?: ClientSession): Promise<void> {
    await this.limits.record(this.toQuery(input, input.matrix), amount, session);
  }

  /** Current daily and monthly consumption, narrowed to the wire contract. */
  async usage(input: LimitCheckInput, session?: ClientSession): Promise<LimitUsage[]> {
    const matrix = await this.effectiveMatrix(input, session);
    return this.limits.usage(this.toQuery(input, matrix), session);
  }

  /** The matrix that binds right now: product, clamped by tier, with live overrides. */
  private async effectiveMatrix(
    input: LimitCheckInput,
    session?: ClientSession,
  ): Promise<LimitMatrix> {
    const now = this.clock.now();
    const live = await this.overrides.findLiveFor(input.accountId, input.scope, now, session);

    return resolveEffectiveMatrix({
      matrix: input.matrix,
      scope: input.scope,
      tier: input.kycTier,
      currency: input.currency,
      channel: input.channel ?? LimitChannel.DEFAULT,
      overrides: live,
      now,
    });
  }

  private toQuery(input: LimitCheckInput, matrix: LimitMatrix) {
    return {
      accountId: input.accountId,
      scope: input.scope,
      matrix,
      currency: input.currency,
      timeZone: input.timeZone,
    };
  }
}
