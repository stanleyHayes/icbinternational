import { type InterestTier } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { rejectionFrom } from '../../accounts/__tests__/accounts-harness.js';
import { dailyAccrualUnits, splitCapitalisation } from '../accrual-math.js';
import { ACCRUAL_DENOMINATOR } from '../day-count.js';

import { TIERED_SAVINGS_TIERS } from './interest-harness.js';

/**
 * The accrual arithmetic, where the rounding convention lives or dies.
 *
 * The invariants that matter: daily accrual is exact (nothing rounds until
 * capitalisation), capitalisation truncates down and carries the sub-minor remainder,
 * and a full rate-year therefore pays exactly the annual rate — the property accrual
 * drift destroys.
 */

const GBP = 'GBP';

const FIXTURE_TIERS = TIERED_SAVINGS_TIERS;

function money(major: string): Money {
  return Money.fromMajor(major, GBP);
}

describe('dailyAccrualUnits', () => {
  it('prices a balance across every band it spans, marginally', () => {
    // £6,000 = £1,000 @ 1% + £4,000 @ 1.5% + £1,000 @ 2% = £90 a year.
    // As exact numerator units: 100000×100 + 400000×150 + 100000×200.
    expect(dailyAccrualUnits(FIXTURE_TIERS, money('6000.00'))).toBe(90_000_000n);
  });

  it('earns the lowest band only on a small balance', () => {
    expect(dailyAccrualUnits(FIXTURE_TIERS, money('800.00'))).toBe(8_000_000n);
  });

  it('stops the middle band exactly at its ceiling', () => {
    // £5,000 fills the first two bands and reaches none of the third.
    expect(dailyAccrualUnits(FIXTURE_TIERS, money('5000.00'))).toBe(70_000_000n);
  });

  it('accrues nothing on an empty or overdrawn account', () => {
    expect(dailyAccrualUnits(FIXTURE_TIERS, money('0.00'))).toBe(0n);
    expect(dailyAccrualUnits(FIXTURE_TIERS, money('-50.00'))).toBe(0n);
  });

  it('accrues nothing when the product pays nothing', () => {
    expect(dailyAccrualUnits([], money('6000.00'))).toBe(0n);
  });

  it('refuses a band priced in a different currency', () => {
    const tiers: InterestTier[] = [
      { fromAmount: { amount: '0', currency: 'EUR' }, toAmount: null, annualRateBps: 100 },
    ];

    const rejection = rejectionFrom(
      Promise.resolve().then(() => dailyAccrualUnits(tiers, money('100.00'))),
    );

    return expect(rejection).resolves.toMatchObject({ code: 'CURRENCY_MISMATCH' });
  });
});

describe('splitCapitalisation', () => {
  it('truncates down to whole minor units and carries the fraction', () => {
    // One day on £6,000 is 90,000,000 / 3,650,000 = 24.6575… pence: 24 paid, the rest carried.
    const split = splitCapitalisation(90_000_000n, GBP);

    expect(split.payable.equals(money('0.24'))).toBe(true);
    expect(split.remainderNumerator).toBe(90_000_000n - 24n * ACCRUAL_DENOMINATOR);
  });

  it('pays nothing when a period earned less than a minor unit', () => {
    const split = splitCapitalisation(1_000_000n, GBP);

    expect(split.payable.isZero).toBe(true);
    expect(split.remainderNumerator).toBe(1_000_000n);
  });

  it('pays exactly the annual rate over a full rate-year, with nothing left over', () => {
    // £6,000 tiered as above for 365 days: 365 × 90,000,000 numerator units.
    const yearOfAccrual = 365n * dailyAccrualUnits(FIXTURE_TIERS, money('6000.00'));
    const split = splitCapitalisation(yearOfAccrual, GBP);

    expect(split.payable.equals(money('90.00'))).toBe(true);
    expect(split.remainderNumerator).toBe(0n);
  });

  it('totals exactly the annual rate when the year is paid monthly with carry', () => {
    // Twelve truncating payouts over a 365-day year lose nothing: the carried remainder
    // of each month is earned into the next.
    const daily = dailyAccrualUnits(FIXTURE_TIERS, money('6000.00'));
    const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    let numerator = 0n;
    let paid = Money.zero(GBP);
    for (const days of monthDays) {
      numerator += BigInt(days) * daily;
      const split = splitCapitalisation(numerator, GBP);
      paid = paid.plus(split.payable);
      numerator = split.remainderNumerator;
    }

    expect(paid.equals(money('90.00'))).toBe(true);
    expect(numerator).toBe(0n);
  });
});
