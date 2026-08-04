import { KycTier, type LimitMatrix } from '@reliance/contracts';

import { LimitChannel } from '../limit-channel.js';
import {
  resolveEffectiveMatrix,
  type EffectiveLimitInput,
  type LimitOverride,
} from '../limit-override.js';
import { ANY_CHANNEL } from '../limits.constants.js';

/**
 * Override resolution, without a database: who wins when several grants, the tier cap
 * and the product matrix all speak to the same field.
 */

const NOW = new Date('2026-08-03T12:00:00.000Z');
const HOUR_MS = 3_600_000;

const PRODUCT: LimitMatrix = {
  perTransaction: gbp('1000000'),
  daily: gbp('5000000'),
  monthly: null,
  dailyCount: null,
};

function gbp(minorUnits: string) {
  return { amount: minorUnits, currency: 'GBP' } as const;
}

function override(partial: Partial<LimitOverride>): LimitOverride {
  return {
    id: 'ovl_test',
    accountId: 'acc_test',
    scope: 'internalTransfer',
    channel: ANY_CHANNEL,
    currency: 'GBP',
    perTransaction: null,
    daily: null,
    monthly: null,
    dailyCount: null,
    reason: 'test grant',
    expiresAt: new Date(NOW.getTime() + HOUR_MS),
    revokedAt: null,
    createdBy: 'adm_test',
    createdAt: NOW,
    ...partial,
  };
}

function input(
  overrides: LimitOverride[],
  channel: LimitChannel = LimitChannel.DEFAULT,
): EffectiveLimitInput {
  return {
    matrix: PRODUCT,
    scope: 'internalTransfer',
    tier: KycTier.TIER_3,
    currency: 'GBP',
    channel,
    overrides,
    now: NOW,
  };
}

describe('resolveEffectiveMatrix', () => {
  it('returns the tier-clamped matrix when no override is live', () => {
    expect(resolveEffectiveMatrix(input([]))).toEqual(PRODUCT);
  });

  it('applies a live override in place of the capped field', () => {
    const effective = resolveEffectiveMatrix(input([override({ daily: '900000' })]));

    expect(effective.daily).toEqual(gbp('900000'));
    expect(effective.perTransaction).toEqual(PRODUCT.perTransaction);
  });

  it('ignores an override whose expiry has passed', () => {
    const expired = override({ daily: '900000', expiresAt: new Date(NOW.getTime() - 1) });

    expect(resolveEffectiveMatrix(input([expired]))).toEqual(PRODUCT);
  });

  it('ignores a revoked override', () => {
    const revoked = override({ daily: '900000', revokedAt: NOW });

    expect(resolveEffectiveMatrix(input([revoked]))).toEqual(PRODUCT);
  });

  it('ignores an override denominated in another currency', () => {
    const euros = override({ daily: '900000', currency: 'EUR' });

    expect(resolveEffectiveMatrix(input([euros]))).toEqual(PRODUCT);
  });

  it('lets a channel-specific override outrank a general one, field by field', () => {
    const general = override({ daily: '900000', monthly: '5000000' });
    const atmSpecific = override({
      channel: LimitChannel.ATM,
      daily: '300000',
      createdAt: new Date(NOW.getTime() - HOUR_MS),
    });

    const effective = resolveEffectiveMatrix(input([general, atmSpecific], LimitChannel.ATM));

    // The older but channel-specific grant wins the field it sets; the general grant
    // still supplies the field the specific one leaves alone.
    expect(effective.daily).toEqual(gbp('300000'));
    expect(effective.monthly).toEqual(gbp('5000000'));
  });

  it('does not apply a channel-specific override to a different channel', () => {
    const atmSpecific = override({ channel: LimitChannel.ATM, daily: '300000' });

    const effective = resolveEffectiveMatrix(input([atmSpecific], LimitChannel.CHIP));

    expect(effective.daily).toEqual(PRODUCT.daily);
  });

  it('lets the newer of two equally specific overrides win', () => {
    const older = override({ daily: '900000', createdAt: new Date(NOW.getTime() - HOUR_MS) });
    const newer = override({ daily: '800000', createdAt: NOW });

    expect(resolveEffectiveMatrix(input([older, newer])).daily).toEqual(gbp('800000'));
  });

  it('can raise a cap the KYC tier would otherwise hold down', () => {
    const grant = override({ daily: '5000000' });
    const lowTier: EffectiveLimitInput = { ...input([grant]), tier: KycTier.TIER_1 };

    const effective = resolveEffectiveMatrix(lowTier);

    // Tier 1 clamps the product to £2,500 a day; the override speaks after the clamp.
    expect(effective.daily).toEqual(gbp('5000000'));
    expect(effective.perTransaction).toEqual(gbp('100000'));
  });
});
