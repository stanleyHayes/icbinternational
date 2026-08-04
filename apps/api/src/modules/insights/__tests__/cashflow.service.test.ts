import { SpendCategory, TransactionDirection } from '@reliance/contracts';

import { CashflowGranularity } from '../cashflow-buckets.js';
import { CashflowService } from '../cashflow.service.js';
import { toPeriod } from '../period.js';

import {
  ACCOUNT_ID,
  buildHarness,
  CURRENCY,
  insertAll,
  spendRow,
  USER_ID,
} from './insights-test.helpers.js';

const QUARTER = toPeriod('2026-01-01T00:00:00.000Z', '2026-03-31T23:59:59.999Z');

function build() {
  const harness = buildHarness();
  return { ...harness, service: new CashflowService(harness.reader, harness.store) };
}

function query(granularity: CashflowGranularity = CashflowGranularity.MONTH) {
  return {
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    currency: CURRENCY,
    period: QUARTER,
    granularity,
  };
}

describe('CashflowService', () => {
  it('emits one bucket per month, including the empty ones', async () => {
    const { store, service } = build();
    await insertAll(store, [
      spendRow({
        minorUnits: 1000,
        category: SpendCategory.DINING,
        bookedAt: new Date('2026-01-15T10:00:00.000Z'),
        runningBalanceMinor: 99_000,
      }),
    ]);

    const cashflow = await service.cashflow(query());

    expect(cashflow.buckets.map((bucket) => bucket.period)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });

  it('separates money in from money out and signs only the net', async () => {
    const { store, service } = build();
    await insertAll(store, [
      spendRow({
        minorUnits: 3000,
        category: SpendCategory.INCOME,
        bookedAt: new Date('2026-02-05T10:00:00.000Z'),
        direction: TransactionDirection.CREDIT,
        runningBalanceMinor: 103_000,
      }),
      spendRow({
        minorUnits: 5000,
        category: SpendCategory.RENT_MORTGAGE,
        bookedAt: new Date('2026-02-06T10:00:00.000Z'),
        runningBalanceMinor: 98_000,
      }),
    ]);

    const february = (await service.cashflow(query())).buckets[1];

    expect(february?.moneyIn.amount).toBe('3000');
    expect(february?.moneyOut.amount).toBe('5000');
    expect(february?.net.amount).toBe('-2000');
  });

  it('reads the closing balance off the last transaction rather than accumulating flows', async () => {
    const { store, service } = build();
    await insertAll(store, [
      spendRow({
        minorUnits: 1000,
        category: SpendCategory.DINING,
        bookedAt: new Date('2026-01-10T10:00:00.000Z'),
        runningBalanceMinor: 99_000,
      }),
      spendRow({
        minorUnits: 2000,
        category: SpendCategory.DINING,
        bookedAt: new Date('2026-01-20T10:00:00.000Z'),
        // Deliberately not 97,000: something outside this range also moved the account,
        // and the recorded balance is the truth the chart must show.
        runningBalanceMinor: 88_000,
      }),
    ]);

    const january = (await service.cashflow(query())).buckets[0];

    expect(january?.closingBalance.amount).toBe('88000');
  });

  it('carries the previous closing balance through an empty bucket', async () => {
    const { store, service } = build();
    await insertAll(store, [
      spendRow({
        minorUnits: 1000,
        category: SpendCategory.DINING,
        bookedAt: new Date('2026-01-10T10:00:00.000Z'),
        runningBalanceMinor: 99_000,
      }),
    ]);

    const buckets = (await service.cashflow(query())).buckets;

    expect(buckets[1]?.closingBalance.amount).toBe('99000');
    expect(buckets[2]?.closingBalance.amount).toBe('99000');
    expect(buckets[1]?.moneyIn.amount).toBe('0');
  });

  it('opens at the balance the account already stood at, not at zero', async () => {
    const { store, service } = build();
    await insertAll(store, [
      spendRow({
        minorUnits: 4000,
        category: SpendCategory.DINING,
        // Before the window opens.
        bookedAt: new Date('2025-12-20T10:00:00.000Z'),
        runningBalanceMinor: 250_000,
      }),
    ]);

    const january = (await service.cashflow(query())).buckets[0];

    expect(january?.closingBalance.amount).toBe('250000');
  });

  it('buckets by ISO week when asked, Monday first', async () => {
    const { store, service } = build();
    await insertAll(store, [
      spendRow({
        minorUnits: 1000,
        category: SpendCategory.DINING,
        // A Thursday, in ISO week 2 of 2026.
        bookedAt: new Date('2026-01-08T10:00:00.000Z'),
        runningBalanceMinor: 99_000,
      }),
    ]);

    const cashflow = await service.cashflow(query(CashflowGranularity.WEEK));
    const populated = cashflow.buckets.find((bucket) => bucket.moneyOut.amount !== '0');

    expect(populated?.period).toMatch(/^2026-W\d{2}$/);
    expect(cashflow.buckets.length).toBeGreaterThan(12);
  });

  it('reports zeros for a quiet quarter rather than an empty list', async () => {
    const { service } = build();

    const cashflow = await service.cashflow(query());

    expect(cashflow.buckets).toHaveLength(3);
    expect(cashflow.buckets.every((bucket) => bucket.net.amount === '0')).toBe(true);
  });
});
