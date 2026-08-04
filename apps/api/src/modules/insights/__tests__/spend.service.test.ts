import { SpendCategory, TransactionDirection, TransactionStatus } from '@reliance/contracts';

import { TransactionService } from '../../transactions/transaction.service.js';
import { BASIS_POINTS_SCALE } from '../insights.constants.js';
import { toPeriod } from '../period.js';
import { SpendService } from '../spend.service.js';

import { buildHarness, CURRENCY, insertAll, spendRow, USER_ID } from './insights-test.helpers.js';

const MARCH = toPeriod('2026-03-01T00:00:00.000Z', '2026-03-31T23:59:59.999Z');
const FEBRUARY_DAY = new Date('2026-02-10T12:00:00.000Z');
const MARCH_DAY = new Date('2026-03-10T12:00:00.000Z');

describe('SpendService', () => {
  it('reconciles exactly with the transaction list it was computed from', async () => {
    const { store, reader } = buildHarness();
    const service = new SpendService(reader);
    const list = new TransactionService(store);

    await insertAll(store, [
      spendRow({ minorUnits: 1250, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
      spendRow({ minorUnits: 4375, category: SpendCategory.GROCERIES, bookedAt: MARCH_DAY }),
      spendRow({ minorUnits: 999, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
    ]);

    const spend = await service.spendByCategory({
      userId: USER_ID,
      currency: CURRENCY,
      period: MARCH,
    });

    const page = await list.list(USER_ID, {
      limit: 100,
      from: MARCH.from.toISOString(),
      to: MARCH.to.toISOString(),
    } as Parameters<TransactionService['list']>[1]);

    const fromList = page.data
      .filter((transaction) => transaction.direction === TransactionDirection.DEBIT)
      .reduce((sum, transaction) => sum + BigInt(transaction.amount.amount), 0n);

    expect(BigInt(spend.total.amount)).toBe(fromList);
    expect(BigInt(spend.total.amount)).toBe(1250n + 4375n + 999n);
  });

  it('splits shares as integers that sum to exactly 10,000 basis points', async () => {
    const { store, reader } = buildHarness();
    const service = new SpendService(reader);

    // Three equal thirds — the classic case where naive rounding gives 9,999.
    await insertAll(store, [
      spendRow({ minorUnits: 1000, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
      spendRow({ minorUnits: 1000, category: SpendCategory.FUEL, bookedAt: MARCH_DAY }),
      spendRow({ minorUnits: 1000, category: SpendCategory.HEALTH, bookedAt: MARCH_DAY }),
    ]);

    const spend = await service.spendByCategory({
      userId: USER_ID,
      currency: CURRENCY,
      period: MARCH,
    });

    const total = spend.categories.reduce((sum, line) => sum + line.shareBps, 0);
    expect(total).toBe(BASIS_POINTS_SCALE);
    expect(spend.categories.every((line) => Number.isInteger(line.shareBps))).toBe(true);
  });

  it('counts debits only, so a refund does not net off the spend it relates to', async () => {
    const { store, reader } = buildHarness();
    const service = new SpendService(reader);

    await insertAll(store, [
      spendRow({ minorUnits: 4000, category: SpendCategory.SHOPPING, bookedAt: MARCH_DAY }),
      spendRow({
        minorUnits: 2000,
        category: SpendCategory.SHOPPING,
        bookedAt: MARCH_DAY,
        direction: TransactionDirection.CREDIT,
      }),
    ]);

    const spend = await service.spendByCategory({
      userId: USER_ID,
      currency: CURRENCY,
      period: MARCH,
    });

    expect(spend.total.amount).toBe('4000');
  });

  it('excludes a reversed movement, because the money came back', async () => {
    const { store, reader } = buildHarness();
    const service = new SpendService(reader);

    await insertAll(store, [
      spendRow({ minorUnits: 5000, category: SpendCategory.TRAVEL, bookedAt: MARCH_DAY }),
      spendRow({
        minorUnits: 9000,
        category: SpendCategory.TRAVEL,
        bookedAt: MARCH_DAY,
        status: TransactionStatus.REVERSED,
      }),
    ]);

    const spend = await service.spendByCategory({
      userId: USER_ID,
      currency: CURRENCY,
      period: MARCH,
    });

    expect(spend.total.amount).toBe('5000');
  });

  describe('period-over-period change', () => {
    it('reports the change against the equally long window before it', async () => {
      const { store, reader } = buildHarness();
      const service = new SpendService(reader);

      await insertAll(store, [
        spendRow({ minorUnits: 1000, category: SpendCategory.DINING, bookedAt: FEBRUARY_DAY }),
        spendRow({ minorUnits: 1500, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
      ]);

      const spend = await service.spendByCategory({
        userId: USER_ID,
        currency: CURRENCY,
        period: MARCH,
      });

      // 1000 → 1500 is +50%, which is +5,000 basis points.
      expect(spend.categories[0]?.changeFromPreviousBps).toBe(5000);
    });

    it('reports null when the category is new, rather than an infinite increase', async () => {
      const { store, reader } = buildHarness();
      const service = new SpendService(reader);

      await insertAll(store, [
        spendRow({ minorUnits: 1500, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
      ]);

      const spend = await service.spendByCategory({
        userId: USER_ID,
        currency: CURRENCY,
        period: MARCH,
      });

      expect(spend.categories[0]?.changeFromPreviousBps).toBeNull();
    });
  });

  it('answers an empty month with zero, not with a division by zero', async () => {
    const { reader } = buildHarness();
    const service = new SpendService(reader);

    const spend = await service.spendByCategory({
      userId: USER_ID,
      currency: CURRENCY,
      period: MARCH,
    });

    expect(spend.total.amount).toBe('0');
    expect(spend.categories).toEqual([]);
  });

  it('ranks the largest category first', async () => {
    const { store, reader } = buildHarness();
    const service = new SpendService(reader);

    await insertAll(store, [
      spendRow({ minorUnits: 500, category: SpendCategory.DINING, bookedAt: MARCH_DAY }),
      spendRow({ minorUnits: 9000, category: SpendCategory.RENT_MORTGAGE, bookedAt: MARCH_DAY }),
      spendRow({ minorUnits: 2000, category: SpendCategory.GROCERIES, bookedAt: MARCH_DAY }),
    ]);

    const spend = await service.spendByCategory({
      userId: USER_ID,
      currency: CURRENCY,
      period: MARCH,
    });

    expect(spend.categories.map((line) => line.category)).toEqual([
      SpendCategory.RENT_MORTGAGE,
      SpendCategory.GROCERIES,
      SpendCategory.DINING,
    ]);
  });
});
