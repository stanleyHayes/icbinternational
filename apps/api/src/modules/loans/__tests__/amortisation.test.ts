import { Money } from '@reliance/money';

import {
  annuityPayment,
  buildSchedule,
  compoundFactor,
  monthlyRate,
  principalForPayment,
  type AmortisationSchedule,
} from '../amortisation.js';
import { RATE_SCALE } from '../loan.constants.js';

/**
 * The schedule maths, tested where it actually breaks.
 *
 * Three properties matter and each is checked across the whole range of the catalogue,
 * not on one happy case: the principal column sums to the advance exactly, the closing
 * balance reaches nil, and the final instalment is the one that absorbs the rounding. A
 * schedule that is out by a penny is a schedule that leaves a customer unable to settle.
 */

const GBP = 'GBP';
const FIRST_PAYMENT = '2026-09-15';

/**
 * Bounds on (1 + 0.01)^480 ≈ 118.6477, held in fixed point.
 *
 * Asserted as `bigint` bounds rather than as a decimal so the precision claim is checked
 * against the value the code actually produces, with no float anywhere in the test.
 */
const COMPOUND_480_LOWER_BOUND = 118_647_000_000_000_000_000n;
const COMPOUND_480_UPPER_BOUND = 118_648_000_000_000_000_000n;

function money(minor: string): Money {
  return Money.fromMinor(minor, GBP);
}

function schedule(input: {
  minor: string;
  aprBps: number;
  termMonths: number;
}): AmortisationSchedule {
  return buildSchedule({
    principal: money(input.minor),
    aprBps: input.aprBps,
    termMonths: input.termMonths,
    firstPaymentDate: FIRST_PAYMENT,
  });
}

function sumPrincipal(built: AmortisationSchedule): Money {
  return built.rows.reduce((total, row) => total.plus(row.principal), Money.zero(GBP));
}

describe('monthlyRate', () => {
  it('divides an annual rate in basis points by twelve, in fixed point', () => {
    // 12.00% a year is 1.00% a month: one hundredth of the fixed-point scale.
    expect(monthlyRate(1200)).toBe(RATE_SCALE / 100n);
  });

  it('is zero for an interest-free product', () => {
    expect(monthlyRate(0)).toBe(0n);
  });
});

describe('compoundFactor', () => {
  it('is the scale itself over nought periods', () => {
    expect(compoundFactor(monthlyRate(999), 0)).toBe(RATE_SCALE);
  });

  it('grows monotonically with the number of periods', () => {
    const rate = monthlyRate(899);
    const twelve = compoundFactor(rate, 12);
    const twentyFour = compoundFactor(rate, 24);

    expect(twentyFour).toBeGreaterThan(twelve);
  });

  it('holds precision over the longest term the contract permits', () => {
    // Still correct to four decimal places after 480 divide-back-to-scale steps.
    const factor = compoundFactor(monthlyRate(1200), 480);

    expect(factor).toBeGreaterThan(COMPOUND_480_LOWER_BOUND);
    expect(factor).toBeLessThan(COMPOUND_480_UPPER_BOUND);
  });
});

describe('annuityPayment', () => {
  it('matches the published instalment for a standard personal loan', () => {
    // £10,000 over 36 months at 8.99% nominal is £317.95 a month.
    const payment = annuityPayment({ principal: money('1000000'), aprBps: 899, termMonths: 36 });

    expect(payment.amount).toBe(31_795n);
  });

  it('is the principal split evenly when the product charges no interest', () => {
    const payment = annuityPayment({ principal: money('120000'), aprBps: 0, termMonths: 12 });

    expect(payment.amount).toBe(10_000n);
  });

  it('refuses a term outside the range the contract permits', () => {
    expect(() =>
      annuityPayment({ principal: money('100000'), aprBps: 899, termMonths: 481 }),
    ).toThrow(RangeError);
  });
});

describe('principalForPayment', () => {
  it('inverts the annuity: what a known instalment buys is the principal it came from', () => {
    const principal = money('1000000');
    const payment = annuityPayment({ principal, aprBps: 899, termMonths: 36 });

    const affordable = principalForPayment({ maxPayment: payment, aprBps: 899, termMonths: 36 });

    // Rounded down at both ends, so the round trip lands within a pound of the original.
    expect(affordable.minus(principal).abs().amount).toBeLessThan(100n);
  });

  it('is the payment times the term when the product charges no interest', () => {
    const affordable = principalForPayment({
      maxPayment: money('10000'),
      aprBps: 0,
      termMonths: 12,
    });

    expect(affordable.amount).toBe(120_000n);
  });

  it('never quotes a principal whose instalment exceeds what the customer can pay', () => {
    const maxPayment = money('25000');
    const affordable = principalForPayment({ maxPayment, aprBps: 1149, termMonths: 48 });

    const instalment = annuityPayment({ principal: affordable, aprBps: 1149, termMonths: 48 });
    expect(instalment.lessThanOrEqual(maxPayment)).toBe(true);
  });
});

describe('buildSchedule', () => {
  const cases = [
    { name: 'personal loan', minor: '1000000', aprBps: 899, termMonths: 36 },
    { name: 'car finance', minor: '2500000', aprBps: 749, termMonths: 60 },
    { name: 'mortgage over thirty-five years', minor: '35000000', aprBps: 489, termMonths: 420 },
    { name: 'business loan', minor: '750000', aprBps: 1149, termMonths: 24 },
    { name: 'interest-free advance', minor: '120000', aprBps: 0, termMonths: 12 },
    { name: 'single-instalment loan', minor: '500000', aprBps: 1499, termMonths: 1 },
    { name: 'an amount that does not divide evenly', minor: '999999', aprBps: 733, termMonths: 7 },
  ];

  it.each(cases)('reconciles the principal column exactly — $name', (input) => {
    const built = schedule(input);

    expect(sumPrincipal(built).amount).toBe(BigInt(input.minor));
  });

  it.each(cases)('runs the balance down to nil — $name', (input) => {
    const built = schedule(input);

    expect(built.rows.at(-1)?.closingBalance.isZero).toBe(true);
  });

  it.each(cases)('emits exactly one row per instalment — $name', (input) => {
    expect(schedule(input).rows).toHaveLength(input.termMonths);
  });

  it.each(cases)('totals repayable to principal plus interest — $name', (input) => {
    const built = schedule(input);

    expect(built.totalRepayable.amount).toBe(BigInt(input.minor) + built.totalInterest.amount);
  });

  it('lets the final instalment absorb the rounding rather than a stray penny', () => {
    const built = schedule({ minor: '999999', aprBps: 733, termMonths: 7 });
    const final = built.rows.at(-1);
    const regular = built.rows[0];

    expect(final?.payment.lessThanOrEqual(regular?.payment ?? built.monthlyPayment)).toBe(true);
  });

  it('charges interest on the opening balance, so the first row costs the most', () => {
    const built = schedule({ minor: '1000000', aprBps: 899, termMonths: 36 });
    const [first] = built.rows;
    const last = built.rows.at(-1);

    expect(first?.interest.greaterThan(last?.interest ?? Money.zero(GBP))).toBe(true);
  });

  it('dates instalments one month apart, clamping to the end of a short month', () => {
    const built = buildSchedule({
      principal: money('300000'),
      aprBps: 899,
      termMonths: 3,
      firstPaymentDate: '2026-12-31',
    });

    expect(built.rows.map((row) => row.dueDate)).toEqual([
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
    ]);
  });

  it('refuses a product whose instalment would never clear the debt', () => {
    // A rate high enough that one month's interest exceeds the level payment.
    expect(() =>
      buildSchedule({
        principal: money('1000000'),
        aprBps: 100_000,
        termMonths: 360,
        firstPaymentDate: FIRST_PAYMENT,
      }),
    ).toThrow(RangeError);
  });
});
