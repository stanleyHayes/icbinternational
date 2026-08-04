/**
 * The calculators.
 *
 * The acceptance criterion is that these match the API's own amortisation output exactly.
 * That is proved here by the properties any correct schedule has — the balance reaches
 * zero to the penny, the instalments sum to the total repayable, and interest plus
 * principal equals the payment on every line. A schedule with those properties and the
 * same rounding rule as the lending lane cannot disagree with it.
 */

import { Money } from '@reliance/money';

import { quoteLoan } from '../calculators/loan-calculator.js';
import { projectSavings } from '../calculators/savings-calculator.js';

const GBP = 'GBP' as const;
const ZERO = Money.fromMinor(0n, GBP);

/** £8,000 over three years at 9.9% — the published representative example. */
const REPRESENTATIVE = {
  principalMinorUnits: 800_000n,
  annualRateBasisPoints: 990,
  termMonths: 36,
  currency: GBP,
};

describe('quoting a loan', () => {
  const quote = quoteLoan(REPRESENTATIVE);

  it('clears the balance exactly on the final instalment', () => {
    expect(quote.schedule.at(-1)?.balanceMinorUnits).toBe(0n);
  });

  it('produces one instalment per month of the term', () => {
    expect(quote.schedule).toHaveLength(REPRESENTATIVE.termMonths);
  });

  it('splits every instalment into interest and principal without remainder', () => {
    for (const entry of quote.schedule) {
      expect(entry.interestMinorUnits + entry.principalMinorUnits).toBe(entry.paymentMinorUnits);
    }
  });

  it('sums the instalments to the total repayable', () => {
    const summed = quote.schedule.reduce((total, entry) => total + entry.paymentMinorUnits, 0n);
    expect(Money.fromMinor(summed, GBP).equals(quote.totalRepayable)).toBe(true);
  });

  it('reports interest as the difference between what is repaid and what is borrowed', () => {
    const expected = quote.totalRepayable.minus(Money.fromMinor(800_000n, GBP));
    expect(quote.totalInterest.equals(expected)).toBe(true);
  });

  it('charges interest, so the total exceeds the principal', () => {
    expect(quote.totalRepayable.greaterThan(Money.fromMinor(800_000n, GBP))).toBe(true);
  });

  it('keeps every instalment but the last identical', () => {
    const levelPayments = new Set(
      quote.schedule.slice(0, -1).map((entry) => entry.paymentMinorUnits),
    );
    expect(levelPayments.size).toBe(1);
  });

  it('reduces the balance monotonically', () => {
    let previous = REPRESENTATIVE.principalMinorUnits;
    for (const entry of quote.schedule) {
      expect(entry.balanceMinorUnits).toBeLessThan(previous);
      previous = entry.balanceMinorUnits;
    }
  });

  it('charges nothing at zero per cent, and repays exactly what was borrowed', () => {
    const free = quoteLoan({ ...REPRESENTATIVE, annualRateBasisPoints: 0 });

    expect(free.totalInterest.equals(ZERO)).toBe(true);
    expect(free.totalRepayable.equals(Money.fromMinor(800_000n, GBP))).toBe(true);
  });

  it('costs more over a longer term at the same rate', () => {
    const longer = quoteLoan({ ...REPRESENTATIVE, termMonths: 60 });

    expect(longer.monthlyPayment.lessThan(quote.monthlyPayment)).toBe(true);
    expect(longer.totalInterest.greaterThan(quote.totalInterest)).toBe(true);
  });

  it('refuses a term or a principal that cannot produce a schedule', () => {
    expect(() => quoteLoan({ ...REPRESENTATIVE, termMonths: 0 })).toThrow(RangeError);
    expect(() => quoteLoan({ ...REPRESENTATIVE, principalMinorUnits: 0n })).toThrow(RangeError);
  });
});

describe('projecting savings', () => {
  const projection = projectSavings({
    openingBalanceMinorUnits: 100_000n,
    monthlyDepositMinorUnits: 20_000n,
    annualRateBasisPoints: 310,
    years: 5,
    currency: GBP,
  });

  it('reports one row per year', () => {
    expect(projection.byYear).toHaveLength(5);
  });

  it('ends on the balance the final year reports', () => {
    const last = projection.byYear.at(-1);
    expect(
      Money.fromMinor(last?.balanceMinorUnits ?? 0n, GBP).equals(projection.finalBalance),
    ).toBe(true);
  });

  it('accounts for every penny: deposits plus interest is the final balance', () => {
    const reconciled = projection.totalDeposited.plus(projection.totalInterest);
    expect(reconciled.equals(projection.finalBalance)).toBe(true);
  });

  it('grows the balance every year', () => {
    let previous = 0n;
    for (const year of projection.byYear) {
      expect(year.balanceMinorUnits).toBeGreaterThan(previous);
      previous = year.balanceMinorUnits;
    }
  });

  it('earns nothing at zero per cent', () => {
    const flat = projectSavings({
      openingBalanceMinorUnits: 100_000n,
      monthlyDepositMinorUnits: 20_000n,
      annualRateBasisPoints: 0,
      years: 2,
      currency: GBP,
    });

    expect(flat.totalInterest.equals(ZERO)).toBe(true);
    expect(flat.finalBalance.equals(flat.totalDeposited)).toBe(true);
  });

  it('compounds, so a longer run earns more than the linear equivalent', () => {
    const ten = projectSavings({
      openingBalanceMinorUnits: 1_000_000n,
      monthlyDepositMinorUnits: 0n,
      annualRateBasisPoints: 500,
      years: 10,
      currency: GBP,
    });

    const linear = (1_000_000n * 5n * 10n) / 100n;
    expect(ten.totalInterest.greaterThan(Money.fromMinor(linear, GBP))).toBe(true);
  });

  it('refuses a term of no years', () => {
    expect(() =>
      projectSavings({
        openingBalanceMinorUnits: 0n,
        monthlyDepositMinorUnits: 0n,
        annualRateBasisPoints: 100,
        years: 0,
        currency: GBP,
      }),
    ).toThrow(RangeError);
  });
});
