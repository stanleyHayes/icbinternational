import { ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { EVERYDAY_CURRENT } from '../../../seed/foundation/catalogue/everyday-current.product.js';
import { annualCreditInterest, resolveCreditRateBps } from '../interest-tiers.js';

/**
 * The rate table of `EVERYDAY_CURRENT`, in basis points:
 *
 *   £0 – £2,500        → 300 bps
 *   £2,500 – £10,000   → 150 bps
 *   £10,000 and above  →  50 bps
 *
 * Bands are marginal: a £10,000 balance earns 300 bps on the first £2,500 and 150 bps on
 * the rest — it is not repriced wholesale at the lower band.
 */

const TIERS = EVERYDAY_CURRENT.creditInterestTiers;
const HEADLINE_BPS = 300;
const MIDDLE_BPS = 150;
const TOP_BPS = 50;

function gbp(minorUnits: string): Money {
  return Money.fromMinor(minorUnits, 'GBP');
}

describe('resolveCreditRateBps', () => {
  it.each([
    ['0', HEADLINE_BPS],
    ['100000', HEADLINE_BPS],
    ['249999', HEADLINE_BPS],
    ['250000', MIDDLE_BPS],
    ['999999', MIDDLE_BPS],
    ['1000000', TOP_BPS],
    ['50000000', TOP_BPS],
  ])('rates a balance of %s minor units at %i bps', (minorUnits, expectedBps) => {
    expect(resolveCreditRateBps(TIERS, gbp(minorUnits))).toBe(expectedBps);
  });

  it('returns null when no band applies', () => {
    expect(resolveCreditRateBps([], gbp('100000'))).toBeNull();
  });
});

describe('annualCreditInterest', () => {
  it('earns nothing on a zero balance', () => {
    expect(annualCreditInterest(TIERS, gbp('0')).amount).toBe(0n);
  });

  it('earns the headline rate within the first band', () => {
    // £2,500.00 × 3.00% = £75.00
    expect(annualCreditInterest(TIERS, gbp('250000')).amount).toBe(7500n);
  });

  it('earns marginally across two bands', () => {
    // £2,500 × 3.00% + £7,500 × 1.50% = £75 + £112.50 = £187.50
    expect(annualCreditInterest(TIERS, gbp('1000000')).amount).toBe(18_750n);
  });

  it('earns marginally across all three bands', () => {
    // £187.50 + £2,500 × 0.50% = £187.50 + £12.50 = £200.00
    expect(annualCreditInterest(TIERS, gbp('1250000')).amount).toBe(20_000n);
  });

  it('refuses a balance in a currency the table does not price', () => {
    let caught: unknown;
    try {
      annualCreditInterest(TIERS, Money.fromMinor('100000', 'EUR'));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe(ErrorCode.CURRENCY_MISMATCH);
  });
});
