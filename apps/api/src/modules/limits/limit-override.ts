import { type KycTier, type LimitMatrix } from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { type LimitScope } from '../products/index.js';

import { clampMatrixForTier } from './kyc-tier-caps.js';
import { type LimitChannel } from './limit-channel.js';
import { ANY_CHANNEL } from './limits.constants.js';

/**
 * A staff-granted deviation from a customer's effective limit, with a hard expiry.
 *
 * An override *replaces* the fields it sets rather than nudging them — "£5,000 a day
 * until Friday", not "+£2,000" — because a delta against a cap that itself changes when
 * the customer upgrades tier or moves channel is impossible to reason about at the
 * complaint desk. Replacement reads the same way the grant was worded.
 *
 * Overrides can lower a cap as readily as raise it; a fraud team shrinking a daily
 * allowance while a case is open is the same mechanism with the numbers pointing the
 * other way.
 */
export interface LimitOverride {
  readonly id: string;
  readonly accountId: string;
  readonly scope: LimitScope;
  /** {@link ANY_CHANNEL} applies to every channel; otherwise one {@link LimitChannel}. */
  readonly channel: string;
  /** All money fields share this currency, enforced when the override is granted. */
  readonly currency: CurrencyCode;
  readonly perTransaction: string | null;
  readonly daily: string | null;
  readonly monthly: string | null;
  readonly dailyCount: number | null;
  readonly reason: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** Everything the engine needs to decide what actually caps one movement. */
export interface EffectiveLimitInput {
  readonly matrix: LimitMatrix;
  readonly scope: LimitScope;
  readonly tier: KycTier;
  readonly currency: CurrencyCode;
  readonly channel: LimitChannel;
  readonly overrides: readonly LimitOverride[];
  readonly now: Date;
}

/**
 * The matrix that genuinely binds a movement: product terms, clamped to the KYC tier,
 * with any live overrides applied on top.
 *
 * Only overrides that are live *right now* apply — unexpired, unrevoked, in the
 * movement's currency. Among live ones a channel-specific grant outranks a general one,
 * and a newer grant outranks an older one of the same specificity, so "support raised it
 * this morning" beats "fraud lowered it last week" only when that is genuinely the
 * later decision. Each cap field is resolved independently, so a daily raise and a
 * per-transaction cut from different overrides compose instead of one burying the other.
 */
export function resolveEffectiveMatrix(input: EffectiveLimitInput): LimitMatrix {
  const clamped = clampMatrixForTier({
    matrix: input.matrix,
    scope: input.scope,
    tier: input.tier,
    currency: input.currency,
    channel: input.channel,
  });

  const live = liveOverrides(input);
  if (live.length === 0) return clamped;

  return {
    perTransaction: fieldFrom(live, 'perTransaction') ?? clamped.perTransaction,
    daily: fieldFrom(live, 'daily') ?? clamped.daily,
    monthly: fieldFrom(live, 'monthly') ?? clamped.monthly,
    dailyCount: countFieldFrom(live) ?? clamped.dailyCount,
  };
}

// --- Internals -------------------------------------------------------------

type MoneyField = 'perTransaction' | 'daily' | 'monthly';

/** Live overrides that match the movement, most authoritative first. */
function liveOverrides(input: EffectiveLimitInput): LimitOverride[] {
  return input.overrides
    .filter((override) => appliesTo(override, input))
    .sort((a, b) => rank(b, input) - rank(a, input));
}

function appliesTo(override: LimitOverride, input: EffectiveLimitInput): boolean {
  if (override.currency !== input.currency) return false;
  if (override.revokedAt !== null) return false;
  if (override.expiresAt.getTime() <= input.now.getTime()) return false;
  return override.channel === ANY_CHANNEL || override.channel === input.channel;
}

/** Channel-specific overrides outrank general ones; recency breaks the tie. */
function rank(override: LimitOverride, input: EffectiveLimitInput): number {
  const specificity = override.channel === input.channel ? 1 : 0;
  return specificity * EPOCH_RANK_BASE + override.createdAt.getTime();
}

/** Keeps a one-day-old specific override ahead of any general one. */
const EPOCH_RANK_BASE = Number.MAX_SAFE_INTEGER / 2;

function fieldFrom(live: readonly LimitOverride[], field: MoneyField): LimitMatrix['daily'] | null {
  for (const override of live) {
    const value = override[field];
    if (value !== null) return { amount: value, currency: override.currency };
  }
  return null;
}

function countFieldFrom(live: readonly LimitOverride[]): number | null {
  for (const override of live) {
    if (override.dailyCount !== null) return override.dailyCount;
  }
  return null;
}
