import { Money } from '@reliance/money';

import {
  activeDaysWithin,
  applyProRata,
  monthPeriodBefore,
  monthPeriodOf,
} from '../maintenance-period.js';

/**
 * The period arithmetic is where a maintenance fee becomes defensible: charge the wrong
 * month, count the wrong days or round the wrong way and every account is off by a
 * little, forever. These cases are the fixtures the sweep's behaviour is read against.
 */

const JULY_2026 = { key: '2026-07', daysInMonth: 31 } as const;

function gbp(minor: string): Money {
  return Money.fromMinor(minor, 'GBP');
}

describe('monthPeriodOf', () => {
  it('describes the UTC calendar month containing the instant', () => {
    const period = monthPeriodOf(new Date('2026-07-19T23:30:00.000Z'));

    expect(period.key).toBe(JULY_2026.key);
    expect(period.start).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(period.end).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(period.daysInMonth).toBe(JULY_2026.daysInMonth);
  });

  it('counts 28 days in a non-leap February and 29 in a leap one', () => {
    expect(monthPeriodOf(new Date('2026-02-10T00:00:00.000Z')).daysInMonth).toBe(28);
    expect(monthPeriodOf(new Date('2028-02-10T00:00:00.000Z')).daysInMonth).toBe(29);
  });
});

describe('monthPeriodBefore', () => {
  it('is the previous calendar month', () => {
    const period = monthPeriodBefore(new Date('2026-08-05T09:00:00.000Z'));

    expect(period.key).toBe(JULY_2026.key);
    expect(period.daysInMonth).toBe(JULY_2026.daysInMonth);
  });

  it('crosses the year boundary', () => {
    const period = monthPeriodBefore(new Date('2026-01-01T00:00:00.000Z'));

    expect(period.key).toBe('2025-12');
    expect(period.daysInMonth).toBe(31);
  });
});

describe('activeDaysWithin', () => {
  const period = monthPeriodOf(new Date('2026-07-15T00:00:00.000Z'));

  it('is the whole month for an account open throughout', () => {
    expect(activeDaysWithin(period, new Date('2020-01-01T00:00:00.000Z'), null)).toBe(31);
  });

  it('counts from the opening day when the account opened mid-month', () => {
    // Opened on the 10th: the 10th through the 31st inclusive is 22 days.
    expect(activeDaysWithin(period, new Date('2026-07-10T09:00:00.000Z'), null)).toBe(22);
  });

  it('counts an opening made one minute before the month ends as one day', () => {
    expect(activeDaysWithin(period, new Date('2026-07-31T23:59:00.000Z'), null)).toBe(1);
  });

  it('counts up to the closing day when the account closed mid-month', () => {
    // Closed on the 20th: the 1st through the 20th inclusive is 20 days.
    expect(
      activeDaysWithin(
        period,
        new Date('2020-01-01T00:00:00.000Z'),
        new Date('2026-07-20T15:00:00.000Z'),
      ),
    ).toBe(20);
  });

  it('is zero for an account opened after the period ended', () => {
    expect(activeDaysWithin(period, new Date('2026-08-01T00:00:00.000Z'), null)).toBe(0);
  });

  it('is zero for an account closed before the period began', () => {
    expect(
      activeDaysWithin(
        period,
        new Date('2020-01-01T00:00:00.000Z'),
        new Date('2026-06-30T23:59:00.000Z'),
      ),
    ).toBe(0);
  });
});

describe('applyProRata', () => {
  it('returns the amount untouched when there is nothing to pro-rate', () => {
    const amount = gbp('3100');

    expect(applyProRata(amount, undefined).amount).toBe(3100n);
    expect(applyProRata(amount, { activeDays: 31, daysInMonth: 31 }).amount).toBe(3100n);
  });

  it('is zero when the account was open for none of the period', () => {
    expect(applyProRata(gbp('3100'), { activeDays: 0, daysInMonth: 31 }).amount).toBe(0n);
  });

  it('scales by the exact day ratio', () => {
    // 3100 minor units for 22 of 31 days is exactly 2200.
    expect(applyProRata(gbp('3100'), { activeDays: 22, daysInMonth: 31 }).amount).toBe(2200n);
  });

  it('rounds once, half-even, when the ratio does not divide exactly', () => {
    // 1000 for 10 of 30 days is 333.33… → 333. 105 for 1 of 2 days is 52.5 → 52 (even).
    expect(applyProRata(gbp('1000'), { activeDays: 10, daysInMonth: 30 }).amount).toBe(333n);
    expect(applyProRata(gbp('105'), { activeDays: 1, daysInMonth: 2 }).amount).toBe(52n);
  });
});
