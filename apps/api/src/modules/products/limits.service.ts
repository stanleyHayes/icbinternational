import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, type LimitMatrix, type LimitUsage } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import {
  buildWindow,
  findBreach,
  LimitPeriod,
  LimitRule,
  toLimitUsages,
  type LimitBreach,
  type LimitScope,
  type LimitWindowUsage,
} from './limit-calculator.js';
import { dayWindow, monthWindow, retentionEnd, type PeriodWindow } from './period-window.js';
import { DEFAULT_TIME_ZONE } from './product.constants.js';
import { UsageCounterRepository, type CounterSnapshot } from './usage-counter.repository.js';

/** Identifies the allowance being asked about. */
export interface LimitQuery {
  readonly accountId: string;
  readonly scope: LimitScope;
  /** The matrix from the product version the account was opened on. */
  readonly matrix: LimitMatrix;
  readonly currency: CurrencyCode;
  /** IANA zone whose midnight resets the daily counters. */
  readonly timeZone?: string;
}

/**
 * Evaluates and records product limits.
 *
 * Counters are read and written per window rather than derived from the transaction feed.
 * Summing a day of postings on every authorisation would be correct and far too slow, and
 * it would also be wrong for the case that matters most: a card authorisation consumes the
 * allowance the moment it is approved, before any posting exists to sum.
 */
@Injectable()
export class LimitsService {
  constructor(
    private readonly counters: UsageCounterRepository,
    private readonly clock: ClockService,
  ) {}

  /**
   * Current daily and monthly consumption for a scope.
   *
   * Returns windows even when nothing is capped, so the caller can show a customer their
   * position rather than only telling them when it is too late.
   */
  async evaluate(query: LimitQuery, session?: ClientSession): Promise<LimitWindowUsage[]> {
    const { day, month } = this.windowsFor(query);

    const snapshots = await this.counters.findWindows(
      query.accountId,
      query.scope,
      [day.key, month.key],
      session,
    );

    return [
      this.toUsage(query, LimitPeriod.DAY, day, snapshots.get(day.key)),
      this.toUsage(query, LimitPeriod.MONTH, month, snapshots.get(month.key)),
    ];
  }

  /** {@link evaluate}, narrowed to the wire contract for a controller to return. */
  async usage(query: LimitQuery, session?: ClientSession): Promise<LimitUsage[]> {
    return toLimitUsages(await this.evaluate(query, session));
  }

  /**
   * Throws `LIMIT_EXCEEDED` if `amount` would not fit, and returns the windows if it would.
   *
   * The error carries the remaining allowance and the reset instant so the client can say
   * "£120 left today, resets at midnight" instead of "declined".
   */
  async check(
    query: LimitQuery,
    amount: Money,
    session?: ClientSession,
  ): Promise<LimitWindowUsage[]> {
    const windows = await this.evaluate(query, session);
    const breach = findBreach({
      matrix: query.matrix,
      windows,
      amount,
      scope: query.scope,
    });

    if (breach) throw limitExceeded(breach, amount);
    return windows;
  }

  /**
   * Consumes allowance for a movement that is actually happening.
   *
   * Pass the session of the transaction that books the movement. A counter incremented
   * outside that transaction survives a rollback and quietly steals the customer's
   * allowance for a payment that never happened.
   */
  async record(query: LimitQuery, amount: Money, session?: ClientSession): Promise<void> {
    const { day, month } = this.windowsFor(query);

    // Sequential, not `Promise.all`: a `ClientSession` cannot carry concurrent operations,
    // and these must share the caller's transaction to roll back with it.
    for (const window of [day, month]) {
      await this.counters.accumulate(
        { accountId: query.accountId, scope: query.scope, periodKey: window.key },
        amount,
        { resetsAt: window.resetsAt, expiresAt: retentionEnd(window.resetsAt) },
        session,
      );
    }
  }

  private windowsFor(query: LimitQuery): { day: PeriodWindow; month: PeriodWindow } {
    const now = this.clock.now();
    const zone = query.timeZone ?? DEFAULT_TIME_ZONE;
    return { day: dayWindow(now, zone), month: monthWindow(now, zone) };
  }

  private toUsage(
    query: LimitQuery,
    period: LimitPeriod,
    window: PeriodWindow,
    snapshot: CounterSnapshot | undefined,
  ): LimitWindowUsage {
    return buildWindow({
      scope: query.scope,
      period,
      matrix: query.matrix,
      used: snapshot?.total ?? Money.zero(query.currency),
      countUsed: snapshot?.count ?? 0,
      resetsAt: window.resetsAt,
    });
  }
}

/** Renders a breach as the contract error, with the numbers the customer needs. */
function limitExceeded(breach: LimitBreach, amount: Money): AppError {
  return new AppError({
    code: ErrorCode.LIMIT_EXCEEDED,
    message: describeBreach(breach),
    details: [{ path: 'amount', message: describeBreach(breach) }],
    context: {
      rule: breach.rule,
      scope: breach.scope,
      requested: amount.toJSON(),
      limit: breach.limit?.toJSON() ?? null,
      remaining: breach.remaining?.toJSON() ?? null,
      countLimit: breach.countLimit,
      countUsed: breach.countUsed,
      resetsAt: breach.resetsAt?.toISOString() ?? null,
    },
  });
}

function describeBreach(breach: LimitBreach): string {
  const resets = breach.resetsAt
    ? ` The allowance resets at ${breach.resetsAt.toISOString()}.`
    : '';

  if (breach.rule === LimitRule.PER_TRANSACTION && breach.limit) {
    return `A single ${breach.scope} may not exceed ${breach.limit.format()}.`;
  }

  if (breach.rule === LimitRule.DAILY_COUNT) {
    return `You have used all ${breach.countLimit} of today's ${breach.scope} transactions.${resets}`;
  }

  if (!breach.limit || !breach.remaining) {
    return `This exceeds your ${breach.scope} limit.${resets}`;
  }

  return `This exceeds your ${breach.scope} limit of ${breach.limit.format()}, of which ${breach.remaining.format()} remains.${resets}`;
}
