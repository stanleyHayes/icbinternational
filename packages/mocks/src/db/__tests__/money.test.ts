/**
 * Minor-unit arithmetic and the simulated clock.
 *
 * Small surface, disproportionate blast radius: every balance, every fee and every date
 * in the fixture set goes through these two modules, so a defect here is a defect in
 * every mock response at once.
 */

import { MockClock, MOCK_EPOCH_MS } from '../clock.js';
import {
  absMoney,
  addMoney,
  applyBps,
  compareMoney,
  isNegative,
  minorUnits,
  money,
  negateMoney,
  subtractMoney,
  sumMoney,
  zero,
} from '../money.js';

describe('money', () => {
  it('round-trips minor units through the wire shape', () => {
    expect(money(1234)).toEqual({ amount: '1234', currency: 'GBP' });
    expect(minorUnits(money(1234))).toBe(1234n);
  });

  it('carries the currency through every operation', () => {
    expect(addMoney(money(100, 'EUR'), money(50, 'EUR')).currency).toBe('EUR');
    expect(zero('USD').currency).toBe('USD');
  });

  it('adds and subtracts exactly', () => {
    expect(addMoney(money(1999), money(1)).amount).toBe('2000');
    expect(subtractMoney(money(1999), money(2000)).amount).toBe('-1');
  });

  /**
   * The reason this module works in `bigint`. A balance beyond 2^53 is well past the
   * point where a float silently starts rounding, and a bank's arithmetic has no
   * business being approximate at any magnitude.
   */
  it('stays exact past the safe-integer boundary', () => {
    const huge = money(9_007_199_254_740_993n);
    expect(addMoney(huge, money(1)).amount).toBe('9007199254740994');
  });

  it('refuses to add across currencies rather than coercing', () => {
    expect(() => addMoney(money(100, 'GBP'), money(100, 'EUR'))).toThrow(TypeError);
    expect(() => subtractMoney(money(100, 'GBP'), money(100, 'USD'))).toThrow(TypeError);
    expect(() => compareMoney(money(1, 'GBP'), money(1, 'JPY'))).toThrow(TypeError);
  });

  it('negates and takes absolute values', () => {
    expect(negateMoney(money(500)).amount).toBe('-500');
    expect(absMoney(money(-500)).amount).toBe('500');
    expect(absMoney(money(500)).amount).toBe('500');
  });

  it('sums a list, and an empty list is zero', () => {
    expect(sumMoney([money(100), money(250), money(3)]).amount).toBe('353');
    expect(sumMoney([], 'EUR')).toEqual({ amount: '0', currency: 'EUR' });
  });

  it('applies basis points, truncating towards zero', () => {
    expect(applyBps(money(10_000), 425).amount).toBe('425');
    // 1 bp of 99 minor units is 0.0099 — truncated, not rounded up to a penny.
    expect(applyBps(money(99), 1).amount).toBe('0');
  });

  it('reports sign and ordering', () => {
    expect(isNegative(money(-1))).toBe(true);
    expect(isNegative(money(0))).toBe(false);
    expect(compareMoney(money(2), money(1))).toBe(1);
    expect(compareMoney(money(1), money(2))).toBe(-1);
    expect(compareMoney(money(1), money(1))).toBe(0);
  });
});

describe('MockClock', () => {
  it('starts frozen at the fixture epoch', () => {
    const clock = new MockClock();
    expect(clock.nowMs()).toBe(MOCK_EPOCH_MS);
    expect(clock.frozen).toBe(true);
    expect(clock.offsetSeconds).toBe(0);
  });

  /**
   * Contract timestamps are `z.iso.datetime({ offset: false })`, which requires the
   * trailing `Z`. Everything here goes through `toISOString()` for exactly that reason.
   */
  it('emits ISO instants with the trailing Z the contract requires', () => {
    const clock = new MockClock();
    expect(clock.nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(clock.daysAgo(3)).toMatch(/Z$/);
    expect(clock.minutesAhead(5)).toMatch(/Z$/);
  });

  it('emits calendar dates without a time component', () => {
    const clock = new MockClock();
    expect(clock.todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clock.dateDaysAgo(30)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clock.dateDaysAhead(30)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('advances by days, hours and minutes together', () => {
    const clock = new MockClock();
    const MINUTES_PER_DAY = 1440;
    const MINUTES_PER_HOUR = 60;

    clock.advance({ days: 1, hours: 2, minutes: 3 });

    const expected = (MINUTES_PER_DAY + 2 * MINUTES_PER_HOUR + 3) * 60;
    expect(clock.offsetSeconds).toBe(expected);
  });

  it('goes back to the epoch on reset', () => {
    const clock = new MockClock();
    clock.advance({ days: 400 });
    clock.setFrozen(false);
    clock.reset();

    expect(clock.nowMs()).toBe(MOCK_EPOCH_MS);
    expect(clock.frozen).toBe(true);
  });

  it('tracks the frozen flag', () => {
    const clock = new MockClock();
    clock.setFrozen(false);
    expect(clock.frozen).toBe(false);
  });

  it('orders past, present and future', () => {
    const clock = new MockClock();
    expect(clock.daysAgo(1) < clock.nowIso()).toBe(true);
    expect(clock.daysAhead(1) > clock.nowIso()).toBe(true);
  });
});
