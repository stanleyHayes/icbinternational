import { Money } from '@reliance/money';

import { accruedTo, breakFigures, interestAtMaturity, interestFor } from '../deposit-interest.js';
import { BREAK_PENALTY_BPS, brokenRateBps, DEPOSIT_RATES, rateForTenor } from '../deposit-rates.js';

/**
 * Deposit interest, and the clawback that makes breaking one cost something.
 *
 * The property that matters most is that a customer can never get back less than they put
 * in. It is asserted directly, and across the whole rate board rather than on one tenor,
 * because the way a penalty produces negative interest is by exceeding a low rate on a
 * short tenor — exactly the case a single happy-path test would miss.
 */

const GBP = 'GBP';

function money(major: string): Money {
  return Money.fromMajor(major, GBP);
}

describe('interestFor', () => {
  it('computes simple interest on an actual/365 day count', () => {
    // £10,000 at 4.65% for 365 days is £465.00.
    const interest = interestFor({ principal: money('10000.00'), annualRateBps: 465, days: 365 });

    expect(interest.equals(money('465.00'))).toBe(true);
  });

  it('is proportional to the days elapsed, not compounded', () => {
    const oneYear = interestFor({ principal: money('10000.00'), annualRateBps: 465, days: 365 });
    const twoYears = interestFor({ principal: money('10000.00'), annualRateBps: 465, days: 730 });

    expect(twoYears.equals(oneYear.times(2))).toBe(true);
  });

  it('is nil before any time has passed', () => {
    expect(interestFor({ principal: money('10000.00'), annualRateBps: 465, days: 0 }).isZero).toBe(
      true,
    );
  });

  it('is nil for a date before the deposit was placed', () => {
    expect(interestFor({ principal: money('10000.00'), annualRateBps: 465, days: -5 }).isZero).toBe(
      true,
    );
  });

  it('rounds a fraction of a penny to the bank, so the expense reconciles', () => {
    // One day on £100 at 3.15% is 0.86 pence, which truncates to nothing.
    const interest = interestFor({ principal: money('100.00'), annualRateBps: 315, days: 1 });

    expect(interest.isZero).toBe(true);
  });
});

describe('accruedTo and interestAtMaturity', () => {
  const placement = {
    principal: money('20000.00'),
    annualRateBps: 465,
    placedOn: '2026-01-15',
  };

  it('accrues nothing on the day of placement', () => {
    expect(accruedTo({ ...placement, asOf: '2026-01-15' }).isZero).toBe(true);
  });

  it('accrues more as the term runs on', () => {
    const oneMonth = accruedTo({ ...placement, asOf: '2026-02-15' });
    const sixMonths = accruedTo({ ...placement, asOf: '2026-07-15' });

    expect(sixMonths.greaterThan(oneMonth)).toBe(true);
  });

  it('reaches the maturity figure on the maturity date', () => {
    const maturity = interestAtMaturity({ ...placement, maturesOn: '2027-01-15' });
    const accrued = accruedTo({ ...placement, asOf: '2027-01-15' });

    expect(accrued.equals(maturity)).toBe(true);
  });
});

describe('brokenRateBps', () => {
  it('reduces the rate by the published penalty', () => {
    expect(brokenRateBps(465)).toBe(465 - BREAK_PENALTY_BPS);
  });

  it('floors at nought rather than producing a negative rate', () => {
    expect(brokenRateBps(100)).toBe(0);
  });
});

describe('breakFigures', () => {
  const placement = {
    principal: money('20000.00'),
    annualRateBps: 465,
    reducedRateBps: brokenRateBps(465),
    placedOn: '2026-01-15',
  };

  it('returns the principal in full alongside the reduced interest', () => {
    const figures = breakFigures({ ...placement, asOf: '2026-07-15' });

    expect(figures.principal.equals(money('20000.00'))).toBe(true);
    expect(figures.netProceeds.greaterThan(figures.principal)).toBe(true);
  });

  it('claws back exactly the difference between the two rates', () => {
    const figures = breakFigures({ ...placement, asOf: '2026-07-15' });
    const atReduced = interestFor({
      principal: placement.principal,
      annualRateBps: placement.reducedRateBps,
      days: 181,
    });

    expect(figures.netProceeds.minus(figures.principal).equals(atReduced)).toBe(true);
    expect(figures.penaltyAmount.equals(figures.interestEarned.minus(atReduced))).toBe(true);
  });

  it('reports the penalty as the rate reduction actually applied', () => {
    const figures = breakFigures({ ...placement, asOf: '2026-07-15' });

    expect(figures.penaltyRateBps).toBe(BREAK_PENALTY_BPS);
  });

  it('costs more the longer the deposit has been running', () => {
    const early = breakFigures({ ...placement, asOf: '2026-02-15' });
    const late = breakFigures({ ...placement, asOf: '2026-12-15' });

    expect(late.penaltyAmount.greaterThan(early.penaltyAmount)).toBe(true);
  });

  it('never returns less than the principal, on any tenor on the board', () => {
    for (const rate of DEPOSIT_RATES) {
      const figures = breakFigures({
        principal: money('1000.00'),
        annualRateBps: rate.annualRateBps,
        reducedRateBps: brokenRateBps(rate.annualRateBps),
        placedOn: '2026-01-15',
        asOf: '2026-01-20',
      });

      expect(figures.netProceeds.greaterThanOrEqual(figures.principal)).toBe(true);
    }
  });

  it('returns the principal untouched when broken on the day it was placed', () => {
    const figures = breakFigures({ ...placement, asOf: '2026-01-15' });

    expect(figures.netProceeds.equals(figures.principal)).toBe(true);
    expect(figures.penaltyAmount.isZero).toBe(true);
  });
});

describe('the rate board', () => {
  it('offers a rate for every tenor it publishes, and none it does not', () => {
    expect(rateForTenor(12)?.annualRateBps).toBe(465);
    expect(rateForTenor(7)).toBeUndefined();
  });

  it('pays more for a longer commitment up to the one-year peak', () => {
    const upToAYear = DEPOSIT_RATES.filter((rate) => rate.termMonths <= 12).map(
      (rate) => rate.annualRateBps,
    );

    expect([...upToAYear].sort((left, right) => left - right)).toEqual(upToAYear);
  });

  it('sets a minimum placement on every tenor', () => {
    expect(DEPOSIT_RATES.every((rate) => BigInt(rate.minAmount.amount) > 0n)).toBe(true);
  });
});
