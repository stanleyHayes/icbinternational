import { Money } from '@reliance/money';

import { type CreditProfile } from '../credit-score.js';
import { affordableAmount, assessEligibility, indicativeAprBps } from '../eligibility.js';
import { findLoanProduct } from '../loan-products.catalogue.js';

/**
 * Eligibility, run against a fixture matrix.
 *
 * A passing applicant is defined once and each case overrides exactly one dimension, so a
 * failure names its own rule. The matrix covers the four axes that can refuse an
 * application — identity tier, default history, affordability and the product's own
 * bounds — because a rule that is only tested in combination is a rule nobody can debug.
 */

const GBP = 'GBP';
const PERSONAL = findLoanProduct('PERSONAL_LOAN');
const MORTGAGE = findLoanProduct('RESIDENTIAL_MORTGAGE');

function money(major: string): Money {
  return Money.fromMajor(major, GBP);
}

function requireProduct(product: ReturnType<typeof findLoanProduct>) {
  if (!product) throw new Error('The catalogue fixture is missing a product');
  return product;
}

const PASSING: CreditProfile = {
  monthlyIncome: money('4500.00'),
  monthlyDebtPayments: money('300.00'),
  employmentMonths: 48,
  monthsWithBank: 36,
  missedPaymentsLast24Months: 0,
  openLoanCount: 0,
  kycTier: 3,
  hasDefaultHistory: false,
};

function assess(overrides: Partial<CreditProfile> = {}, amount = money('8000.00')) {
  return assessEligibility({
    product: requireProduct(PERSONAL),
    profile: { ...PASSING, ...overrides },
    requestedAmount: amount,
    termMonths: 48,
  });
}

describe('assessEligibility', () => {
  it('accepts an applicant who meets every rule', () => {
    const verdict = assess();

    expect(verdict.eligible).toBe(true);
    expect(verdict.indicativeAprBps).not.toBeNull();
    expect(verdict.reasons).toHaveLength(1);
  });

  it('always reports a credit score and a debt-to-income ratio', () => {
    const verdict = assess();

    expect(verdict.creditScore).toBeGreaterThanOrEqual(300);
    expect(verdict.creditScore).toBeLessThanOrEqual(850);
    expect(verdict.debtToIncomeBps).toBe(666);
  });

  const refusals = [
    { name: 'an identity tier below the product’s', overrides: { kycTier: 1 } },
    { name: 'a recorded default', overrides: { hasDefaultHistory: true } },
    {
      name: 'commitments that already consume the income',
      overrides: { monthlyDebtPayments: money('4400.00') },
    },
    { name: 'no recorded income', overrides: { monthlyIncome: money('0.00') } },
  ];

  it.each(refusals)('refuses $name', ({ overrides }) => {
    const verdict = assess(overrides);

    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.length).toBeGreaterThan(0);
    expect(verdict.indicativeAprBps).toBeNull();
  });

  it('refuses an amount below the product minimum', () => {
    expect(assess({}, money('500.00')).eligible).toBe(false);
  });

  it('refuses an amount above the product maximum', () => {
    expect(assess({}, money('40000.00')).eligible).toBe(false);
  });

  it('refuses a term outside the product’s range', () => {
    const verdict = assessEligibility({
      product: requireProduct(PERSONAL),
      profile: PASSING,
      requestedAmount: money('8000.00'),
      termMonths: 6,
    });

    expect(verdict.eligible).toBe(false);
  });

  it('still quotes a maximum on a decline, so the form can suggest a workable amount', () => {
    const verdict = assess({}, money('40000.00'));

    expect(Money.fromJSON(verdict.maxAmount).isPositive).toBe(true);
  });

  it('never offers more than the product’s own ceiling, however large the income', () => {
    const wealthy = assess({ monthlyIncome: money('50000.00') }, money('20000.00'));
    const ceiling = Money.fromJSON(requireProduct(PERSONAL).maxAmount);

    expect(Money.fromJSON(wealthy.maxAmount).lessThanOrEqual(ceiling)).toBe(true);
  });

  it('writes reasons a customer can act on, not codes', () => {
    const verdict = assess({ kycTier: 1 });

    expect(verdict.reasons.join(' ')).toMatch(/verif/i);
  });
});

describe('indicativeAprBps', () => {
  it('gives the headline rate to the strongest profiles', () => {
    const product = requireProduct(PERSONAL);

    expect(indicativeAprBps(product, 800)).toBe(product.minAprBps);
  });

  it('gives the ceiling rate to the weakest', () => {
    const product = requireProduct(PERSONAL);

    expect(indicativeAprBps(product, 400)).toBe(product.maxAprBps);
  });

  it('never worsens the rate as the score improves', () => {
    const product = requireProduct(MORTGAGE);
    const rates = [500, 600, 650, 700, 740, 800].map((score) => indicativeAprBps(product, score));

    expect([...rates].sort((left, right) => right - left)).toEqual(rates);
  });

  it('stays inside the product’s published corridor at every score', () => {
    const product = requireProduct(PERSONAL);

    for (let score = 300; score <= 850; score += 10) {
      const rate = indicativeAprBps(product, score);
      expect(rate).toBeGreaterThanOrEqual(product.minAprBps);
      expect(rate).toBeLessThanOrEqual(product.maxAprBps);
    }
  });
});

describe('affordableAmount', () => {
  it('is nil when commitments already exceed income', () => {
    const amount = affordableAmount(
      {
        product: requireProduct(PERSONAL),
        profile: { ...PASSING, monthlyDebtPayments: money('5000.00') },
        requestedAmount: money('8000.00'),
        termMonths: 48,
      },
      700,
    );

    expect(amount.isZero).toBe(true);
  });

  it('rises with income', () => {
    const request = {
      product: requireProduct(PERSONAL),
      profile: PASSING,
      requestedAmount: money('8000.00'),
      termMonths: 48,
    };
    const modest = affordableAmount(request, 700);
    const higher = affordableAmount(
      { ...request, profile: { ...PASSING, monthlyIncome: money('9000.00') } },
      700,
    );

    expect(higher.greaterThanOrEqual(modest)).toBe(true);
  });
});
