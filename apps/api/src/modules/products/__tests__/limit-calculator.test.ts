import { type LimitMatrix } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { STUDENT_CURRENT } from '../../../seed/foundation/catalogue/student-current.product.js';
import {
  buildWindow,
  findBreach,
  LimitPeriod,
  LimitRule,
  LimitScope,
  matrixFor,
  toLimitUsage,
  toLimitUsages,
  type LimitWindowUsage,
} from '../limit-calculator.js';

const gbp = (major: string) => Money.fromMajor(major, 'GBP');
const RESETS_AT = new Date('2026-07-01T23:00:00.000Z');

function matrix(overrides: Partial<LimitMatrix> = {}): LimitMatrix {
  return { perTransaction: null, daily: null, monthly: null, dailyCount: null, ...overrides };
}

function dayWindowOf(options: {
  matrix: LimitMatrix;
  used?: Money;
  countUsed?: number;
}): LimitWindowUsage {
  return buildWindow({
    scope: LimitScope.CARD_SPEND,
    period: LimitPeriod.DAY,
    matrix: options.matrix,
    used: options.used ?? gbp('0.00'),
    countUsed: options.countUsed ?? 0,
    resetsAt: RESETS_AT,
  });
}

describe('buildWindow', () => {
  it('reports the remaining allowance so a client can warn before the wall', () => {
    const window = dayWindowOf({
      matrix: matrix({ daily: gbp('500.00').toJSON() }),
      used: gbp('460.00'),
    });

    expect(window.remaining?.toMajorString()).toBe('40.00');
  });

  it('reports no cap rather than a zero cap when the dimension is uncapped', () => {
    const window = dayWindowOf({ matrix: matrix({ dailyCount: 5 }) });

    expect(window.limit).toBeNull();
    expect(window.remaining).toBeNull();
    expect(window.countLimit).toBe(5);
  });

  it('floors remaining at zero when a cap was lowered mid-window', () => {
    const window = dayWindowOf({
      matrix: matrix({ daily: gbp('100.00').toJSON() }),
      used: gbp('250.00'),
    });

    expect(window.remaining?.toMajorString()).toBe('0.00');
  });

  it('reads the monthly cap for a monthly window and ignores the daily count', () => {
    const window = buildWindow({
      scope: LimitScope.CARD_SPEND,
      period: LimitPeriod.MONTH,
      matrix: matrix({
        daily: gbp('500.00').toJSON(),
        monthly: gbp('5000.00').toJSON(),
        dailyCount: 5,
      }),
      used: gbp('1000.00'),
      countUsed: 12,
      resetsAt: RESETS_AT,
    });

    expect(window.limit?.toMajorString()).toBe('5000.00');
    expect(window.countLimit).toBeNull();
  });
});

describe('findBreach', () => {
  const scope = LimitScope.CARD_SPEND;

  it('passes a movement that fits every cap', () => {
    const configured = matrix({
      perTransaction: gbp('500.00').toJSON(),
      daily: gbp('1000.00').toJSON(),
    });

    const breach = findBreach({
      matrix: configured,
      windows: [dayWindowOf({ matrix: configured, used: gbp('100.00') })],
      amount: gbp('250.00'),
      scope,
    });

    expect(breach).toBeNull();
  });

  it('reports the per-transaction cap ahead of the daily one', () => {
    // The daily allowance is untouched, so a "daily limit reached" message would send the
    // customer to the wrong screen.
    const configured = matrix({
      perTransaction: gbp('500.00').toJSON(),
      daily: gbp('10000.00').toJSON(),
    });

    const breach = findBreach({
      matrix: configured,
      windows: [dayWindowOf({ matrix: configured })],
      amount: gbp('750.00'),
      scope,
    });

    expect(breach?.rule).toBe(LimitRule.PER_TRANSACTION);
    expect(breach?.resetsAt).toBeNull();
  });

  it('reports the daily amount cap with what is left and when it returns', () => {
    const configured = matrix({ daily: gbp('500.00').toJSON() });

    const breach = findBreach({
      matrix: configured,
      windows: [dayWindowOf({ matrix: configured, used: gbp('450.00') })],
      amount: gbp('100.00'),
      scope,
    });

    expect(breach?.rule).toBe(LimitRule.DAILY_AMOUNT);
    expect(breach?.remaining?.toMajorString()).toBe('50.00');
    expect(breach?.resetsAt).toEqual(RESETS_AT);
  });

  it('reports the monthly cap when the day still has room', () => {
    const configured = matrix({
      daily: gbp('5000.00').toJSON(),
      monthly: gbp('10000.00').toJSON(),
    });

    const monthly = buildWindow({
      scope,
      period: LimitPeriod.MONTH,
      matrix: configured,
      used: gbp('9900.00'),
      countUsed: 0,
      resetsAt: RESETS_AT,
    });

    const breach = findBreach({
      matrix: configured,
      windows: [dayWindowOf({ matrix: configured }), monthly],
      amount: gbp('200.00'),
      scope,
    });

    expect(breach?.rule).toBe(LimitRule.MONTHLY_AMOUNT);
  });

  it('reports a count breach even when the value would have fitted', () => {
    const configured = matrix({ daily: gbp('500.00').toJSON(), dailyCount: 3 });

    const breach = findBreach({
      matrix: configured,
      windows: [dayWindowOf({ matrix: configured, used: gbp('10.00'), countUsed: 3 })],
      amount: gbp('1.00'),
      scope,
    });

    expect(breach?.rule).toBe(LimitRule.DAILY_COUNT);
    expect(breach?.countLimit).toBe(3);
  });

  it('reports a count breach on a dimension with no amount cap at all', () => {
    const configured = matrix({ dailyCount: 2 });

    const breach = findBreach({
      matrix: configured,
      windows: [dayWindowOf({ matrix: configured, countUsed: 2 })],
      amount: gbp('1.00'),
      scope,
    });

    expect(breach?.rule).toBe(LimitRule.DAILY_COUNT);
    expect(breach?.limit).toBeNull();
  });

  it('allows a movement that lands exactly on the cap', () => {
    const configured = matrix({
      perTransaction: gbp('500.00').toJSON(),
      daily: gbp('500.00').toJSON(),
    });

    const breach = findBreach({
      matrix: configured,
      windows: [dayWindowOf({ matrix: configured })],
      amount: gbp('500.00'),
      scope,
    });

    expect(breach).toBeNull();
  });
});

describe('toLimitUsage', () => {
  it('renders a capped window in the contract shape', () => {
    const usage = toLimitUsage(
      dayWindowOf({
        matrix: matrix({ daily: gbp('500.00').toJSON(), dailyCount: 6 }),
        used: gbp('120.00'),
      }),
    );

    expect(usage).toEqual({
      scope: 'cardSpend:DAY',
      limit: { amount: '50000', currency: 'GBP' },
      used: { amount: '12000', currency: 'GBP' },
      remaining: { amount: '38000', currency: 'GBP' },
      countLimit: 6,
      countUsed: 0,
      resetsAt: RESETS_AT.toISOString(),
    });
  });

  it('omits an uncapped window, which the contract cannot express', () => {
    expect(toLimitUsage(dayWindowOf({ matrix: matrix({ dailyCount: 5 }) }))).toBeNull();
    expect(toLimitUsages([dayWindowOf({ matrix: matrix({ dailyCount: 5 }) })])).toHaveLength(0);
  });
});

describe('matrixFor', () => {
  it('reads the seeded student account caps', () => {
    const caps = matrixFor(STUDENT_CURRENT, LimitScope.ATM_WITHDRAWAL);

    expect(caps.daily).toEqual({ amount: '30000', currency: 'GBP' });
    expect(caps.dailyCount).toBe(4);
  });
});
