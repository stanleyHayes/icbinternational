/**
 * The lending catalogue as it is advertised.
 *
 * These are the rates, limits and terms the marketing site publishes and the credit
 * agreement repeats, so they live as data rather than as scattered literals. The
 * representative APR is the rate at least 51% of accepted applicants receive, which is the
 * figure a lender is required to advertise; the min and max bound the risk-priced range an
 * individual customer is actually offered.
 */

import { LoanKind, type LoanProduct } from '@reliance/contracts';

const STERLING = 'GBP';

/** Every product open to new applications, in the order the catalogue lists them. */
export const LOAN_PRODUCTS: readonly LoanProduct[] = Object.freeze([
  {
    code: 'PERSONAL_LOAN',
    name: 'Reliance Personal Loan',
    kind: LoanKind.PERSONAL,
    currency: STERLING,
    minAmount: { amount: '100000', currency: STERLING },
    maxAmount: { amount: '2500000', currency: STERLING },
    minTermMonths: 12,
    maxTermMonths: 84,
    representativeAprBps: 899,
    minAprBps: 599,
    maxAprBps: 2499,
    arrangementFee: { amount: '0', currency: STERLING },
    earlyRepaymentFeeBps: 0,
    minKycTier: 2,
    description:
      'Borrow from £1,000 to £25,000 over one to seven years at a fixed rate, with the ' +
      'same payment every month and no fee for settling early.',
  },
  {
    code: 'AUTO_LOAN',
    name: 'Reliance Car Finance',
    kind: LoanKind.AUTO,
    currency: STERLING,
    minAmount: { amount: '300000', currency: STERLING },
    maxAmount: { amount: '7500000', currency: STERLING },
    minTermMonths: 24,
    maxTermMonths: 84,
    representativeAprBps: 749,
    minAprBps: 449,
    maxAprBps: 1899,
    arrangementFee: { amount: '14900', currency: STERLING },
    earlyRepaymentFeeBps: 0,
    minKycTier: 2,
    description:
      'Fixed-rate finance for a new or used car, from £3,000 to £75,000 over two to ' +
      'seven years. The vehicle is yours from day one — we take no security over it.',
  },
  {
    code: 'RESIDENTIAL_MORTGAGE',
    name: 'Reliance Residential Mortgage',
    kind: LoanKind.MORTGAGE,
    currency: STERLING,
    minAmount: { amount: '5000000', currency: STERLING },
    maxAmount: { amount: '100000000', currency: STERLING },
    minTermMonths: 60,
    maxTermMonths: 420,
    representativeAprBps: 489,
    minAprBps: 399,
    maxAprBps: 799,
    arrangementFee: { amount: '99900', currency: STERLING },
    earlyRepaymentFeeBps: 100,
    minKycTier: 3,
    description:
      'A repayment mortgage from £50,000 to £1,000,000 over five to thirty-five years. ' +
      'Overpay up to 10% of the balance each year without a charge.',
  },
  {
    code: 'BUSINESS_LOAN',
    name: 'Reliance Business Loan',
    kind: LoanKind.BUSINESS,
    currency: STERLING,
    minAmount: { amount: '500000', currency: STERLING },
    maxAmount: { amount: '25000000', currency: STERLING },
    minTermMonths: 12,
    maxTermMonths: 120,
    representativeAprBps: 1149,
    minAprBps: 749,
    maxAprBps: 2199,
    arrangementFee: { amount: '25000', currency: STERLING },
    earlyRepaymentFeeBps: 100,
    minKycTier: 3,
    description:
      'Working capital or growth funding from £5,000 to £250,000 over one to ten years, ' +
      'with a decision on most applications the same working day.',
  },
]);

/** Documents an applicant must supply before a decision can be made, by product kind. */
export const REQUIRED_DOCUMENTS: Readonly<Record<LoanKind, readonly string[]>> = Object.freeze({
  [LoanKind.PERSONAL]: Object.freeze(['PAYSLIP', 'BANK_STATEMENT']),
  [LoanKind.AUTO]: Object.freeze(['PAYSLIP', 'BANK_STATEMENT', 'VEHICLE_INVOICE']),
  [LoanKind.MORTGAGE]: Object.freeze([
    'PAYSLIP',
    'BANK_STATEMENT',
    'PROOF_OF_ADDRESS',
    'PROPERTY_VALUATION',
    'DEPOSIT_SOURCE',
  ]),
  [LoanKind.BUSINESS]: Object.freeze([
    'BUSINESS_ACCOUNTS',
    'BANK_STATEMENT',
    'VAT_RETURN',
    'DIRECTOR_IDENTIFICATION',
  ]),
  [LoanKind.OVERDRAFT]: Object.freeze(['BANK_STATEMENT']),
});

/** Looks a product up by its catalogue code. */
export function findLoanProduct(code: string): LoanProduct | undefined {
  return LOAN_PRODUCTS.find((product) => product.code === code);
}
