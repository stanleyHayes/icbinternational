import { KycTier, type LimitMatrix } from '@reliance/contracts';

import { clampMatrixForTier, tierCapsFor } from '../kyc-tier-caps.js';
import { LimitChannel } from '../limit-channel.js';

/**
 * The tier-cap table and the clamp, without a database.
 *
 * The numbers asserted here are the table itself — when compliance re-tables the caps,
 * these tests are where the change shows up for review.
 */

const UNCAPPED: LimitMatrix = {
  perTransaction: null,
  daily: null,
  monthly: null,
  dailyCount: null,
};

const GENEROUS: LimitMatrix = {
  perTransaction: gbp('10000000'),
  daily: gbp('5000000'),
  monthly: gbp('20000000'),
  dailyCount: null,
};

function gbp(minorUnits: string) {
  return { amount: minorUnits, currency: 'GBP' } as const;
}

describe('clampMatrixForTier', () => {
  it('leaves tier 3 customers to the product matrix alone', () => {
    const clamped = clampMatrixForTier({
      matrix: GENEROUS,
      scope: 'internalTransfer',
      tier: KycTier.TIER_3,
      currency: 'GBP',
      channel: LimitChannel.DEFAULT,
    });

    expect(clamped).toEqual(GENEROUS);
  });

  it('lowers a product cap that exceeds the tier ceiling', () => {
    const clamped = clampMatrixForTier({
      matrix: GENEROUS,
      scope: 'internalTransfer',
      tier: KycTier.TIER_1,
      currency: 'GBP',
      channel: LimitChannel.DEFAULT,
    });

    // Tier 1 internal: £1,000 per transaction, £2,500 a day, £10,000 a month.
    expect(clamped.perTransaction).toEqual(gbp('100000'));
    expect(clamped.daily).toEqual(gbp('250000'));
    expect(clamped.monthly).toEqual(gbp('1000000'));
  });

  it('keeps the product cap when the product is already tighter than the tier', () => {
    const modest: LimitMatrix = { ...UNCAPPED, daily: gbp('5000') };

    const clamped = clampMatrixForTier({
      matrix: modest,
      scope: 'internalTransfer',
      tier: KycTier.TIER_1,
      currency: 'GBP',
      channel: LimitChannel.DEFAULT,
    });

    expect(clamped.daily).toEqual(gbp('5000'));
  });

  it('caps tier 0 international transfers at zero — tier 0 cannot send abroad', () => {
    const clamped = clampMatrixForTier({
      matrix: GENEROUS,
      scope: 'internationalTransfer',
      tier: KycTier.TIER_0,
      currency: 'GBP',
      channel: LimitChannel.DEFAULT,
    });

    expect(clamped.perTransaction).toEqual(gbp('0'));
    expect(clamped.daily).toEqual(gbp('0'));
    expect(clamped.monthly).toEqual(gbp('0'));
  });

  it('caps online card spend below card-present spend at the same tier', () => {
    const online = clampMatrixForTier({
      matrix: GENEROUS,
      scope: 'cardSpend',
      tier: KycTier.TIER_1,
      currency: 'GBP',
      channel: LimitChannel.ONLINE,
    });
    const chip = clampMatrixForTier({
      matrix: GENEROUS,
      scope: 'cardSpend',
      tier: KycTier.TIER_1,
      currency: 'GBP',
      channel: LimitChannel.CHIP,
    });

    expect(online.perTransaction).toEqual(gbp('50000'));
    expect(chip.perTransaction).toEqual(gbp('100000'));
  });

  it('falls back to the scope row for fields a channel row does not set', () => {
    const caps = tierCapsFor('cardSpend', KycTier.TIER_1, 'GBP', LimitChannel.ONLINE);

    // The ONLINE row only tightens per-transaction; the daily cap is the scope's.
    expect(caps?.perTransaction).toBe('50000');
    expect(caps?.daily).toBe('250000');
  });

  it('imposes no tier cap in a currency the table does not cover', () => {
    const clamped = clampMatrixForTier({
      matrix: GENEROUS,
      scope: 'internalTransfer',
      tier: KycTier.TIER_0,
      currency: 'EUR',
      channel: LimitChannel.DEFAULT,
    });

    expect(clamped).toEqual(GENEROUS);
    expect(tierCapsFor('internalTransfer', KycTier.TIER_0, 'EUR', LimitChannel.DEFAULT)).toBeNull();
  });
});
