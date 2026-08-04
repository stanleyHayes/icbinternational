import {
  ACCRUAL_DENOMINATOR,
  accrualDenominator,
  DayCountConvention,
  HOUSE_DAY_COUNT,
} from '../day-count.js';

/**
 * Day-count conventions: the only thing a convention contributes is the denominator of
 * the exact-rational accumulator, and getting it wrong re-prices every account at once.
 */

describe('accrualDenominator', () => {
  it('is basis points times 365 on the actual/365 convention', () => {
    expect(accrualDenominator(DayCountConvention.ACT_365)).toBe(3_650_000n);
  });

  it('is basis points times 360 on the money-market convention', () => {
    expect(accrualDenominator(DayCountConvention.ACT_360)).toBe(3_600_000n);
  });

  it('pays more per day on actual/360 for the same quoted rate', () => {
    // The 360 denominator is smaller, so the same numerator converts to more money.
    expect(accrualDenominator(DayCountConvention.ACT_360)).toBeLessThan(
      accrualDenominator(DayCountConvention.ACT_365),
    );
  });
});

describe('the house convention', () => {
  it('is actual/365, the sterling retail standard the other lanes accrue on', () => {
    expect(HOUSE_DAY_COUNT).toBe(DayCountConvention.ACT_365);
    expect(ACCRUAL_DENOMINATOR).toBe(3_650_000n);
  });
});
