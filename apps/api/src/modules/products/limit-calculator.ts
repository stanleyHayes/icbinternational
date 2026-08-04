import { type LimitMatrix, type LimitUsage, type Product } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { fromWire } from '../../common/money/money.codec.js';

/**
 * Limit arithmetic: what is left, when it comes back, and whether the next movement fits.
 *
 * The point of computing "remaining" even when nothing is breached is that the dashboard
 * can warn a customer at £4,500 of a £5,000 daily limit instead of declining them at
 * £5,001. A limit engine that only answers yes/no is a worse product than one that
 * answers "you have £500 left until 00:00".
 */

/** The five dimensions a product caps, named as they appear on `Product.limits`. */
export const LimitScope = {
  INTERNAL_TRANSFER: 'internalTransfer',
  DOMESTIC_TRANSFER: 'domesticTransfer',
  INTERNATIONAL_TRANSFER: 'internationalTransfer',
  CARD_SPEND: 'cardSpend',
  ATM_WITHDRAWAL: 'atmWithdrawal',
} as const;
export type LimitScope = (typeof LimitScope)[keyof typeof LimitScope];

/** Counter windows a scope is measured over. */
export const LimitPeriod = { DAY: 'DAY', MONTH: 'MONTH' } as const;
export type LimitPeriod = (typeof LimitPeriod)[keyof typeof LimitPeriod];

/** Which cap a movement ran into. */
export const LimitRule = {
  PER_TRANSACTION: 'PER_TRANSACTION',
  DAILY_AMOUNT: 'DAILY_AMOUNT',
  MONTHLY_AMOUNT: 'MONTHLY_AMOUNT',
  DAILY_COUNT: 'DAILY_COUNT',
} as const;
export type LimitRule = (typeof LimitRule)[keyof typeof LimitRule];

/**
 * One window's allowance and consumption.
 *
 * `limit` and `remaining` are nullable, which the contract's `LimitUsage` is not: a scope
 * can cap the number of movements per day without capping their total value, and there is
 * no honest money value for "uncapped". Such a window is surfaced internally and omitted
 * from the wire — see `docs/CONTRACT_CHANGES.md`.
 */
export interface LimitWindowUsage {
  readonly scope: LimitScope;
  readonly period: LimitPeriod;
  readonly limit: Money | null;
  readonly used: Money;
  readonly remaining: Money | null;
  readonly countLimit: number | null;
  readonly countUsed: number;
  readonly resetsAt: Date;
}

/** A cap the requested movement would exceed. */
export interface LimitBreach {
  readonly rule: LimitRule;
  readonly scope: LimitScope;
  /** Null when the breached cap is a movement count rather than an amount. */
  readonly limit: Money | null;
  readonly remaining: Money | null;
  readonly countLimit: number | null;
  readonly countUsed: number;
  /** Null for `PER_TRANSACTION`, which never resets — the movement is simply too big. */
  readonly resetsAt: Date | null;
}

/** The matrix a product applies to one scope. */
export function matrixFor(product: Product, scope: LimitScope): LimitMatrix {
  return product.limits[scope];
}

/** Builds the usage view of one window from its configured cap and its counter. */
export function buildWindow(options: {
  scope: LimitScope;
  period: LimitPeriod;
  matrix: LimitMatrix;
  used: Money;
  countUsed: number;
  resetsAt: Date;
}): LimitWindowUsage {
  const cap = capFor(options.matrix, options.period);
  const limit = cap ? fromWire(cap) : null;

  return {
    scope: options.scope,
    period: options.period,
    limit,
    used: options.used,
    remaining: limit ? floorAtZero(limit.minus(options.used)) : null,
    countLimit: options.period === LimitPeriod.DAY ? options.matrix.dailyCount : null,
    countUsed: options.countUsed,
    resetsAt: options.resetsAt,
  };
}

/**
 * The first cap `amount` would breach, or null.
 *
 * Checked cheapest and most specific first: an amount over the per-transaction cap is
 * rejected for the same reason however much room the daily allowance has, and telling the
 * customer "your daily limit is exhausted" when the real problem is a single oversized
 * payment sends them to the wrong screen.
 */
export function findBreach(options: {
  matrix: LimitMatrix;
  windows: readonly LimitWindowUsage[];
  amount: Money;
  scope: LimitScope;
}): LimitBreach | null {
  const perTransaction = options.matrix.perTransaction
    ? fromWire(options.matrix.perTransaction)
    : null;

  if (perTransaction && options.amount.greaterThan(perTransaction)) {
    return {
      rule: LimitRule.PER_TRANSACTION,
      scope: options.scope,
      limit: perTransaction,
      remaining: perTransaction,
      countLimit: null,
      countUsed: 0,
      resetsAt: null,
    };
  }

  for (const window of options.windows) {
    const breach = breachOfWindow(window, options.amount);
    if (breach) return breach;
  }

  return null;
}

/** Narrows a window to the contract shape, or null when the window has no money cap. */
export function toLimitUsage(window: LimitWindowUsage): LimitUsage | null {
  if (!window.limit || !window.remaining) return null;

  return {
    scope: `${window.scope}:${window.period}`,
    limit: window.limit.toJSON(),
    used: window.used.toJSON(),
    remaining: window.remaining.toJSON(),
    countLimit: window.countLimit,
    countUsed: window.countUsed,
    resetsAt: window.resetsAt.toISOString(),
  };
}

/** Every window that can be expressed on the wire, in the order they were evaluated. */
export function toLimitUsages(windows: readonly LimitWindowUsage[]): LimitUsage[] {
  return windows.map((window) => toLimitUsage(window)).filter(isPresent);
}

// --- Internals -------------------------------------------------------------

function breachOfWindow(window: LimitWindowUsage, amount: Money): LimitBreach | null {
  if (window.countLimit !== null && window.countUsed + ONE_MOVEMENT > window.countLimit) {
    return breach(LimitRule.DAILY_COUNT, window);
  }

  if (!window.remaining) return null;
  if (amount.lessThanOrEqual(window.remaining)) return null;

  return breach(amountRuleFor(window.period), window);
}

function breach(rule: LimitRule, window: LimitWindowUsage): LimitBreach {
  return {
    rule,
    scope: window.scope,
    limit: window.limit,
    remaining: window.remaining,
    countLimit: window.countLimit,
    countUsed: window.countUsed,
    resetsAt: window.resetsAt,
  };
}

function amountRuleFor(period: LimitPeriod): LimitRule {
  return period === LimitPeriod.DAY ? LimitRule.DAILY_AMOUNT : LimitRule.MONTHLY_AMOUNT;
}

function capFor(matrix: LimitMatrix, period: LimitPeriod) {
  return period === LimitPeriod.DAY ? matrix.daily : matrix.monthly;
}

/** A counter can exceed its cap if the cap was lowered mid-window; remaining is never negative. */
function floorAtZero(value: Money): Money {
  return value.isNegative ? Money.zero(value.currency) : value;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

const ONE_MOVEMENT = 1;
