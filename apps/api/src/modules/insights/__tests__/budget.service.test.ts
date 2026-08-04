import { SpendCategory } from '@reliance/contracts';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import {
  allocateBasisPoints,
  changeInBasisPoints,
  utilisationInBasisPoints,
} from '../basis-points.js';
import { BUDGET_ID_PREFIX } from '../budget-id.js';
import { currentMonth } from '../budget-period.js';
import { BudgetService } from '../budget.service.js';
import { BASIS_POINTS_SCALE } from '../insights.constants.js';
import { InMemoryBudgetStore } from '../repositories/in-memory-budget.store.js';
import { SpendService } from '../spend.service.js';

import { buildHarness, CURRENCY, insertAll, spendRow, USER_ID } from './insights-test.helpers.js';

const MARCH_DAY = new Date('2026-03-10T12:00:00.000Z');
const CLOCK = { now: () => new Date('2026-03-15T09:00:00.000Z') } as unknown as ClockService;
const OTHER_USER = 'usr_01JQ8Z00000000000000000009';

function build() {
  const harness = buildHarness();
  const budgets = new InMemoryBudgetStore();
  return {
    ...harness,
    budgets,
    service: new BudgetService(budgets, new SpendService(harness.reader), CLOCK),
  };
}

const limit = (minorUnits: string) => ({ amount: minorUnits, currency: CURRENCY });

describe('BudgetService', () => {
  it('computes utilisation from the same rows the spend screen uses', async () => {
    const { store, service } = build();
    await insertAll(store, [
      spendRow({ minorUnits: 6000, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
      spendRow({ minorUnits: 2500, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
      spendRow({ minorUnits: 9999, category: SpendCategory.TRAVEL, bookedAt: MARCH_DAY }),
    ]);

    await service.upsert(USER_ID, {
      category: SpendCategory.DINING,
      limit: limit('20000'),
      alertAtBps: 8000,
    });

    const [budget] = await service.list(USER_ID);

    expect(budget?.spent.amount).toBe('8500');
    expect(budget?.remaining.amount).toBe('11500');
    expect(budget?.utilisationBps).toBe(4250);
  });

  it('reports a negative remaining once overspent rather than clamping to zero', async () => {
    const { store, service } = build();
    await insertAll(store, [
      spendRow({ minorUnits: 30_000, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
    ]);

    const budget = await service.upsert(USER_ID, {
      category: SpendCategory.DINING,
      limit: limit('20000'),
      alertAtBps: 8000,
    });

    expect(budget.remaining.amount).toBe('-10000');
    expect(budget.utilisationBps).toBe(15_000);
  });

  it('keeps the same identifier when a limit is adjusted', async () => {
    const { service } = build();

    const first = await service.upsert(USER_ID, {
      category: SpendCategory.DINING,
      limit: limit('20000'),
      alertAtBps: 8000,
    });
    const second = await service.upsert(USER_ID, {
      category: SpendCategory.DINING,
      limit: limit('30000'),
      alertAtBps: 9000,
    });

    expect(second.id).toBe(first.id);
    expect(second.limit.amount).toBe('30000');
    expect(await service.list(USER_ID)).toHaveLength(1);
  });

  it('mints a prefixed identifier', async () => {
    const { service } = build();

    const budget = await service.upsert(USER_ID, {
      category: SpendCategory.FUEL,
      limit: limit('5000'),
      alertAtBps: 8000,
    });

    expect(budget.id.startsWith(`${BUDGET_ID_PREFIX}_`)).toBe(true);
  });

  it('reports the current calendar month as the period', async () => {
    const { service } = build();

    const budget = await service.upsert(USER_ID, {
      category: SpendCategory.FUEL,
      limit: limit('5000'),
      alertAtBps: 8000,
    });
    const expected = currentMonth(CLOCK.now());

    expect(budget.periodStart).toBe(expected.from.toISOString());
    expect(budget.periodEnd).toBe(expected.to.toISOString());
  });

  it('refuses to remove another customer budget', async () => {
    const { service } = build();
    const budget = await service.upsert(USER_ID, {
      category: SpendCategory.FUEL,
      limit: limit('5000'),
      alertAtBps: 8000,
    });

    await expect(
      service.remove({ userId: OTHER_USER, budgetId: budget.id }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(service.remove({ userId: USER_ID, budgetId: budget.id })).resolves.toBeUndefined();
  });

  it('answers an empty list without touching the transaction store', async () => {
    const { service } = build();
    await expect(service.list(USER_ID)).resolves.toEqual([]);
  });
});

describe('basis points', () => {
  it('allocates shares that sum to exactly ten thousand', () => {
    expect(allocateBasisPoints([1n, 1n, 1n])).toEqual([3334, 3333, 3333]);
    expect(allocateBasisPoints([1n, 1n, 1n]).reduce((a, b) => a + b, 0)).toBe(BASIS_POINTS_SCALE);
  });

  it('is deterministic when remainders tie', () => {
    expect(allocateBasisPoints([7n, 7n, 7n])).toEqual(allocateBasisPoints([7n, 7n, 7n]));
  });

  it('answers all zeros for an empty total rather than dividing by it', () => {
    expect(allocateBasisPoints([0n, 0n])).toEqual([0, 0]);
    expect(allocateBasisPoints([])).toEqual([]);
  });

  it('reports change against a previous period, and null when there was none', () => {
    expect(changeInBasisPoints(1500n, 1000n)).toBe(5000);
    expect(changeInBasisPoints(500n, 1000n)).toBe(-5000);
    expect(changeInBasisPoints(1000n, 0n)).toBeNull();
  });

  it('does not cap utilisation at a hundred percent', () => {
    expect(utilisationInBasisPoints(15_000n, 10_000n)).toBe(15_000);
    expect(utilisationInBasisPoints(0n, 0n)).toBe(0);
  });
});
