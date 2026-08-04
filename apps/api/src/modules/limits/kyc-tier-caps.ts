import { KycTier, type LimitMatrix } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { fromWire } from '../../common/money/money.codec.js';
import { type LimitScope } from '../products/index.js';

import { LimitChannel } from './limit-channel.js';

/**
 * KYC-tier caps: the ceiling a customer's verification level puts on a scope, before the
 * product's own matrix is even consulted.
 *
 * A product limit says what the *account* may do; a tier cap says what the *customer* may
 * do given how well we know them. Both bind, so the effective cap is the lower of the
 * two. Tier 3 is a fully verified customer and carries no cap here at all — only the
 * product matrix applies.
 *
 * The table is consulted on every check rather than snapshotted onto the account, so an
 * upgrade lifts the customer's limits the moment the KYC decision lands.
 *
 * Caps are denominated per currency because a £2,500 tier cap cannot be compared with a
 * EUR matrix without an FX opinion the limits engine does not have. Currencies with no
 * row are uncapped at tier level — the product matrix still binds — and adding a currency
 * is a deliberate compliance decision, not a default.
 */

/** One scope's caps at one tier. Minor units as strings; null means uncapped. */
interface TierCapRow {
  readonly perTransaction: string | null;
  readonly daily: string | null;
  readonly monthly: string | null;
  readonly dailyCount: number | null;
}

/** The tiers that carry caps. Tier 3 is absent because it is uncapped. */
type CappedTier = typeof KycTier.TIER_0 | typeof KycTier.TIER_1 | typeof KycTier.TIER_2;

type CapsByTier = Readonly<Record<CappedTier, TierCapRow>>;

const GBP_SCOPE_CAPS: Readonly<Record<LimitScope, CapsByTier>> = {
  internalTransfer: {
    [KycTier.TIER_0]: row('5000', '10000', '50000'),
    [KycTier.TIER_1]: row('100000', '250000', '1000000'),
    [KycTier.TIER_2]: row('1000000', '2500000', '10000000'),
  },
  domesticTransfer: {
    [KycTier.TIER_0]: row('5000', '10000', '50000'),
    [KycTier.TIER_1]: row('100000', '250000', '1000000'),
    [KycTier.TIER_2]: row('1000000', '2500000', '10000000'),
  },
  internationalTransfer: {
    // Tier 0 cannot send internationally at all; a zero cap is how the engine says so.
    [KycTier.TIER_0]: row('0', '0', '0'),
    [KycTier.TIER_1]: row('50000', '100000', '400000'),
    [KycTier.TIER_2]: row('500000', '1000000', '4000000'),
  },
  cardSpend: {
    [KycTier.TIER_0]: row('5000', '10000', '50000'),
    [KycTier.TIER_1]: row('100000', '250000', '1000000'),
    [KycTier.TIER_2]: row('500000', '1000000', '4000000'),
  },
  atmWithdrawal: {
    [KycTier.TIER_0]: row('5000', '10000', '30000'),
    [KycTier.TIER_1]: row('25000', '50000', '200000'),
    [KycTier.TIER_2]: row('50000', '100000', '500000'),
  },
};

/**
 * Channel-specific rows, keyed `<scope>:<channel>`, consulted before the scope row.
 *
 * Card-not-present spend is capped at half the card-present per-transaction allowance:
 * the fraud mix, not the money, is what differs between the channels.
 */
const GBP_CHANNEL_CAPS: Readonly<Record<string, CapsByTier>> = {
  [`cardSpend:${LimitChannel.ONLINE}`]: {
    [KycTier.TIER_0]: row('2500', null, null),
    [KycTier.TIER_1]: row('50000', null, null),
    [KycTier.TIER_2]: row('250000', null, null),
  },
  [`cardSpend:${LimitChannel.RECURRING}`]: {
    [KycTier.TIER_0]: row('2500', null, null),
    [KycTier.TIER_1]: row('50000', null, null),
    [KycTier.TIER_2]: row('250000', null, null),
  },
};

const SCOPE_TABLES: Readonly<Record<string, Readonly<Record<LimitScope, CapsByTier>>>> = {
  GBP: GBP_SCOPE_CAPS,
};

const CHANNEL_TABLES: Readonly<Record<string, Readonly<Record<string, CapsByTier>>>> = {
  GBP: GBP_CHANNEL_CAPS,
};

/**
 * The tier caps that apply to a movement, or null when the tier imposes none.
 *
 * A channel row supplies only the fields it sets; unset fields fall back to the scope
 * row, so tightening online per-transaction spend does not silently uncap the daily
 * total.
 */
export function tierCapsFor(
  scope: LimitScope,
  tier: KycTier,
  currency: CurrencyCode,
  channel: LimitChannel,
): TierCapRow | null {
  if (tier === KycTier.TIER_3) return null;
  const scopeRow = SCOPE_TABLES[currency]?.[scope]?.[tier as CappedTier];
  const channelRow = channelRowFor(scope, tier, currency, channel);

  if (!scopeRow && !channelRow) return null;
  return {
    perTransaction: fieldOf(channelRow, scopeRow, 'perTransaction'),
    daily: fieldOf(channelRow, scopeRow, 'daily'),
    monthly: fieldOf(channelRow, scopeRow, 'monthly'),
    dailyCount: fieldOf(channelRow, scopeRow, 'dailyCount'),
  };
}

/** The channel-specific row for a movement, if the table sets one. */
function channelRowFor(
  scope: LimitScope,
  tier: KycTier,
  currency: CurrencyCode,
  channel: LimitChannel,
): TierCapRow | undefined {
  if (channel === LimitChannel.DEFAULT) return undefined;
  return CHANNEL_TABLES[currency]?.[`${scope}:${channel}`]?.[tier as CappedTier];
}

/** A channel row's value for a field, falling back to the scope row when unset. */
function fieldOf<K extends keyof TierCapRow>(
  channelRow: TierCapRow | undefined,
  scopeRow: TierCapRow | undefined,
  field: K,
): TierCapRow[K] | null {
  return channelRow?.[field] ?? scopeRow?.[field] ?? null;
}

/**
 * Lowers a product matrix to whatever the customer's KYC tier allows.
 *
 * Field-wise minimum, with null read as "uncapped" on both sides: the tighter of the
 * product's terms and the tier's ceiling always wins, and a field neither side caps
 * stays uncapped.
 */
export function clampMatrixForTier(options: {
  matrix: LimitMatrix;
  scope: LimitScope;
  tier: KycTier;
  currency: CurrencyCode;
  channel: LimitChannel;
}): LimitMatrix {
  const caps = tierCapsFor(options.scope, options.tier, options.currency, options.channel);
  if (!caps) return options.matrix;

  return {
    perTransaction: tighter(options.matrix.perTransaction, caps.perTransaction, options.currency),
    daily: tighter(options.matrix.daily, caps.daily, options.currency),
    monthly: tighter(options.matrix.monthly, caps.monthly, options.currency),
    dailyCount: tighterCount(options.matrix.dailyCount, caps.dailyCount),
  };
}

// --- Internals -------------------------------------------------------------

function row(
  perTransaction: string | null,
  daily: string | null,
  monthly: string | null,
  dailyCount: number | null = null,
): TierCapRow {
  return { perTransaction, daily, monthly, dailyCount };
}

/** The lower of two nullable wire amounts, as a wire amount. */
function tighter(
  productCap: LimitMatrix['daily'],
  tierCap: string | null,
  currency: CurrencyCode,
): LimitMatrix['daily'] {
  if (!productCap) return tierCap ? { amount: tierCap, currency } : null;
  if (!tierCap) return productCap;

  const tierMoney = Money.fromMinor(tierCap, currency);
  return tierMoney.lessThan(fromWire(productCap)) ? { amount: tierCap, currency } : productCap;
}

function tighterCount(productCount: number | null, tierCount: number | null): number | null {
  if (productCount === null) return tierCount;
  if (tierCount === null) return productCount;
  return Math.min(productCount, tierCount);
}
