import { TransactionDirection } from '@reliance/contracts';

import { archivePeriods, monthlyPeriod } from '../statement-period.js';

import { account, buildHarness, gbp, row, type StatementsHarness } from './statements-harness.js';

const CREDIT = TransactionDirection.CREDIT;
const DEBIT = TransactionDirection.DEBIT;

describe('StatementBuilderService', () => {
  let harness: StatementsHarness;

  beforeEach(async () => {
    harness = buildHarness();

    // December: paid 500.00 in, spent 120.00. January: spent 80.00.
    await harness.store.insert(
      row({
        minorUnits: 50_000,
        runningBalanceMinor: 50_000,
        bookedAt: '2025-12-03T10:00:00.000Z',
        direction: CREDIT,
      }),
    );
    await harness.store.insert(
      row({
        minorUnits: 12_000,
        runningBalanceMinor: 38_000,
        bookedAt: '2025-12-20T10:00:00.000Z',
        direction: DEBIT,
      }),
    );
    await harness.store.insert(
      row({
        minorUnits: 8_000,
        runningBalanceMinor: 30_000,
        bookedAt: '2026-01-14T10:00:00.000Z',
        direction: DEBIT,
      }),
    );
  });

  it('opens at zero for the first period an account has', async () => {
    const december = await harness.builder.detail(account(), monthlyPeriod(2025, 11));

    expect(december.figures.opening.amount).toBe(0n);
    expect(december.figures.credits.amount).toBe(gbp(50_000).amount);
    expect(december.figures.debits.amount).toBe(gbp(12_000).amount);
    expect(december.figures.closing.amount).toBe(gbp(38_000).amount);
    expect(december.figures.count).toBe(2);
  });

  it('carries the closing balance into the next period as its opening balance', async () => {
    const january = await harness.builder.detail(account(), monthlyPeriod(2026, 0));

    expect(january.figures.opening.amount).toBe(gbp(38_000).amount);
    expect(january.figures.closing.amount).toBe(gbp(30_000).amount);
  });

  it('reports a quiet month at the balance it was left at, not at zero', async () => {
    const february = await harness.builder.detail(account(), monthlyPeriod(2026, 1));

    expect(february.figures.count).toBe(0);
    expect(february.figures.opening.amount).toBe(gbp(30_000).amount);
    expect(february.figures.closing.amount).toBe(gbp(30_000).amount);
  });

  it('reconciles down the archive: each closing balance is the next opening balance', async () => {
    const periods = archivePeriods({
      openedAt: account().openedAt,
      asOf: new Date('2026-03-04T12:00:00.000Z'),
      limit: 10,
    });

    const summaries = await harness.builder.archive(account(), periods);
    expect(summaries.map((summary) => summary.period.label)).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
    ]);

    // Newest first, so each entry's opening balance is the *next* entry's closing balance.
    for (let index = 0; index < summaries.length - 1; index += 1) {
      const newer = summaries[index];
      const older = summaries[index + 1];
      expect(newer?.figures.opening.amount).toBe(older?.figures.closing.amount);
    }
  });

  it('agrees with the ledger: opening plus in, less out, is the recorded closing balance', async () => {
    const december = await harness.builder.detail(account(), monthlyPeriod(2025, 11));
    const derived = december.figures.opening
      .plus(december.figures.credits)
      .minus(december.figures.debits);

    expect(derived.amount).toBe(december.figures.closing.amount);
  });

  it('sees nothing on an account that has no postings of its own', async () => {
    const other = account({ id: 'acc_01JQ8Z00000000000000000002' });
    const december = await harness.builder.detail(other, monthlyPeriod(2025, 11));

    expect(december.figures.count).toBe(0);
    expect(december.figures.closing.amount).toBe(0n);
  });
});
