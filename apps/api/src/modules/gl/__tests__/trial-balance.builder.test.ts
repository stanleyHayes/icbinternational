import { LedgerAccountType } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { CHART_OF_ACCOUNTS, GL } from '../../../domain/ledger/chart-of-accounts.js';
import { type GlAccountTotals } from '../gl-totals.repository.js';
import {
  buildTrialBalance,
  netBalance,
  type TrialBalanceAccount,
} from '../trial-balance.builder.js';

const AS_OF = new Date('2026-03-15T12:00:00.000Z');

const chartRows: TrialBalanceAccount[] = CHART_OF_ACCOUNTS.map((entry) => ({
  code: entry.code,
  name: entry.name,
  type: entry.type,
}));

function totals(code: string, debits: string, credits: string): GlAccountTotals {
  return { code, debits, credits };
}

describe('buildTrialBalance', () => {
  it('sums to zero on the seeded chart with balanced movement', () => {
    // £10,000 of deposits backed by central-bank cash, plus £25 of fee income.
    const report = buildTrialBalance({
      currency: 'GBP',
      asOf: AS_OF,
      accounts: chartRows,
      totals: [
        totals(GL.CASH_AT_CENTRAL_BANK, '1000000', '0'),
        totals(GL.CUSTOMER_DEPOSITS, '2500', '1000000'),
        totals(GL.FEE_INCOME, '0', '2500'),
      ],
    });

    expect(report.balanced).toBe(true);
    expect(report.difference).toEqual({ amount: '0', currency: 'GBP' });
    expect(report.totalDebits).toEqual(report.totalCredits);
    expect(report.totalDebits).toEqual({ amount: '1002500', currency: 'GBP' });
    expect(report.asOf).toBe(AS_OF.toISOString());
    expect(report.lines).toHaveLength(CHART_OF_ACCOUNTS.length);
  });

  it('reports every active account, including rows with no movement', () => {
    const report = buildTrialBalance({
      currency: 'GBP',
      asOf: AS_OF,
      accounts: chartRows,
      totals: [totals(GL.CASH_AT_CENTRAL_BANK, '500', '0')],
    });

    const untouched = report.lines.find((line) => line.code === GL.LOANS_RECEIVABLE);
    expect(untouched).toBeDefined();
    expect(untouched?.debit).toEqual({ amount: '0', currency: 'GBP' });
    expect(untouched?.credit).toEqual({ amount: '0', currency: 'GBP' });
  });

  it('flags an unbalanced book instead of hiding it', () => {
    const report = buildTrialBalance({
      currency: 'GBP',
      asOf: AS_OF,
      accounts: chartRows,
      totals: [totals(GL.SUSPENSE, '999', '0')],
    });

    expect(report.balanced).toBe(false);
    expect(report.difference).toEqual({ amount: '999', currency: 'GBP' });
  });

  it('keeps currencies independent — GBP movement does not leak into a USD report', () => {
    const report = buildTrialBalance({
      currency: 'USD',
      asOf: AS_OF,
      accounts: chartRows,
      totals: [],
    });

    expect(report.balanced).toBe(true);
    expect(report.totalDebits).toEqual({ amount: '0', currency: 'USD' });
  });

  it('handles movement larger than 2^53 minor units exactly', () => {
    const large = '900719925474099300';
    const report = buildTrialBalance({
      currency: 'GBP',
      asOf: AS_OF,
      accounts: chartRows,
      totals: [
        totals(GL.CASH_AT_CENTRAL_BANK, large, '0'),
        totals(GL.CUSTOMER_DEPOSITS, '0', large),
      ],
    });

    expect(report.balanced).toBe(true);
    expect(report.totalDebits.amount).toBe(large);
  });
});

describe('netBalance', () => {
  const moved = totals(GL.CASH_AT_CENTRAL_BANK, '700', '200');

  it('is debit-positive for assets', () => {
    const balance = netBalance(LedgerAccountType.ASSET, moved, 'GBP');
    expect(balance.equals(Money.fromMinor('500', 'GBP'))).toBe(true);
  });

  it('is credit-positive for liabilities', () => {
    const balance = netBalance(LedgerAccountType.LIABILITY, moved, 'GBP');
    expect(balance.equals(Money.fromMinor('-500', 'GBP'))).toBe(true);
  });

  it('is credit-positive for income and equity', () => {
    expect(
      netBalance(LedgerAccountType.INCOME, moved, 'GBP').equals(Money.fromMinor('-500', 'GBP')),
    ).toBe(true);
    expect(
      netBalance(LedgerAccountType.EQUITY, moved, 'GBP').equals(Money.fromMinor('-500', 'GBP')),
    ).toBe(true);
  });

  it('is debit-positive for expenses', () => {
    const balance = netBalance(LedgerAccountType.EXPENSE, moved, 'GBP');
    expect(balance.equals(Money.fromMinor('500', 'GBP'))).toBe(true);
  });

  it('is zero when the account has no movement', () => {
    expect(netBalance(LedgerAccountType.ASSET, undefined, 'GBP').isZero).toBe(true);
  });
});
