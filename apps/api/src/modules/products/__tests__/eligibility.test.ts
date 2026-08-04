import { ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { EVERYDAY_CURRENT } from '../../../seed/foundation/catalogue/everyday-current.product.js';
import { checkEligibility, type ApplicantSnapshot } from '../eligibility.js';

/**
 * The eligibility rules, run against a fixture matrix.
 *
 * `EVERYDAY_CURRENT` asks for KYC tier 1, opens at £0 and is sold in GBP only; each case
 * overrides exactly one dimension of a passing applicant, so a failure names its rule.
 */

const PASSING: ApplicantSnapshot = {
  kycTier: 1,
  openingBalance: Money.fromMinor('10000', 'GBP'),
};

describe('checkEligibility', () => {
  it('approves an applicant who meets every rule', () => {
    const verdict = checkEligibility(EVERYDAY_CURRENT, PASSING);

    expect(verdict.eligible).toBe(true);
    expect(verdict.denials).toEqual([]);
  });

  it('denies an applicant below the product’s KYC tier', () => {
    const verdict = checkEligibility(EVERYDAY_CURRENT, { ...PASSING, kycTier: 0 });

    expect(verdict.eligible).toBe(false);
    expect(verdict.denials.map((denial) => denial.code)).toEqual([ErrorCode.KYC_TIER_TOO_LOW]);
  });

  it('denies an opening deposit in a currency the product is not sold in', () => {
    const verdict = checkEligibility(EVERYDAY_CURRENT, {
      ...PASSING,
      openingBalance: Money.fromMinor('10000', 'EUR'),
    });

    expect(verdict.denials.map((denial) => denial.code)).toEqual([ErrorCode.CURRENCY_MISMATCH]);
  });

  it('denies an opening deposit below the product’s floor', () => {
    const product = {
      ...EVERYDAY_CURRENT,
      minOpeningBalance: { amount: '50000', currency: 'GBP' } as const,
    };

    const verdict = checkEligibility(product, {
      ...PASSING,
      openingBalance: Money.fromMinor('10000', 'GBP'),
    });

    expect(verdict.denials.map((denial) => denial.code)).toEqual([ErrorCode.AMOUNT_BELOW_MINIMUM]);
  });

  it('accepts an opening deposit exactly at the floor', () => {
    const product = {
      ...EVERYDAY_CURRENT,
      minOpeningBalance: { amount: '10000', currency: 'GBP' } as const,
    };

    expect(checkEligibility(product, PASSING).eligible).toBe(true);
  });

  it('denies new applications on a withdrawn product', () => {
    const verdict = checkEligibility({ ...EVERYDAY_CURRENT, active: false }, PASSING);

    expect(verdict.denials.map((denial) => denial.code)).toEqual([ErrorCode.PRECONDITION_FAILED]);
  });

  it('reports every failed rule at once, not just the first', () => {
    const verdict = checkEligibility(EVERYDAY_CURRENT, {
      kycTier: 0,
      openingBalance: Money.fromMinor('10000', 'EUR'),
    });

    expect(verdict.denials.map((denial) => denial.code)).toEqual([
      ErrorCode.KYC_TIER_TOO_LOW,
      ErrorCode.CURRENCY_MISMATCH,
    ]);
  });

  it('does not compare amounts when the currency denial already applies', () => {
    // Comparing a EUR deposit against a GBP floor would throw a currency-mismatch from
    // the money library; the currency denial is the whole answer.
    const product = {
      ...EVERYDAY_CURRENT,
      minOpeningBalance: { amount: '50000', currency: 'GBP' } as const,
    };

    const verdict = checkEligibility(product, {
      ...PASSING,
      openingBalance: Money.fromMinor('1', 'EUR'),
    });

    expect(verdict.denials.map((denial) => denial.code)).toEqual([ErrorCode.CURRENCY_MISMATCH]);
  });
});
