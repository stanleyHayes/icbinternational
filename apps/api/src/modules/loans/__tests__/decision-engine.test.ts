import { LoanApplicationStatus, type LoanEligibility } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { decide, LoanDecision } from '../decision-engine.js';
import { findLoanProduct } from '../loan-products.catalogue.js';

/**
 * The decision engine, over the matrix of things that can change the answer.
 *
 * Eligibility is supplied directly rather than computed, because the point of this suite
 * is the policy layered on top of it: which scores approve, which refer, which decline,
 * and what an outstanding document does to an otherwise perfect application.
 */

const GBP = 'GBP';
const PERSONAL = findLoanProduct('PERSONAL_LOAN');

function requireProduct() {
  if (!PERSONAL) throw new Error('The catalogue fixture is missing PERSONAL_LOAN');
  return PERSONAL;
}

function money(major: string): Money {
  return Money.fromMajor(major, GBP);
}

function eligibility(overrides: Partial<LoanEligibility> = {}): LoanEligibility {
  return {
    eligible: true,
    maxAmount: money('15000.00').toJSON(),
    indicativeAprBps: 899,
    creditScore: 760,
    debtToIncomeBps: 1200,
    reasons: [],
    ...overrides,
  };
}

function run(overrides: Partial<LoanEligibility> = {}, documents: string[] = []) {
  return decide({
    product: requireProduct(),
    eligibility: eligibility(overrides),
    requestedAmount: money('8000.00'),
    outstandingDocumentKinds: documents,
  });
}

describe('decide', () => {
  it('approves a strong application with every document in', () => {
    const outcome = run();

    expect(outcome.decision).toBe(LoanDecision.APPROVE);
    expect(outcome.status).toBe(LoanApplicationStatus.APPROVED);
  });

  it('refers an application that is still waiting on a document', () => {
    const outcome = run({}, ['PAYSLIP']);

    expect(outcome.decision).toBe(LoanDecision.REFER);
    expect(outcome.status).toBe(LoanApplicationStatus.REFERRED);
    expect(outcome.reasons.join(' ')).toMatch(/documents/i);
  });

  it('refers a score below the automatic threshold', () => {
    expect(run({ creditScore: 660 }).decision).toBe(LoanDecision.REFER);
  });

  it('refers a debt-to-income ratio above the referral threshold', () => {
    expect(run({ debtToIncomeBps: 4500 }).decision).toBe(LoanDecision.REFER);
  });

  it('refers an advance near the top of the product, whatever the score', () => {
    const outcome = decide({
      product: requireProduct(),
      eligibility: eligibility({ maxAmount: money('25000.00').toJSON(), creditScore: 830 }),
      requestedAmount: money('24000.00'),
      outstandingDocumentKinds: [],
    });

    expect(outcome.decision).toBe(LoanDecision.REFER);
    expect(outcome.reasons.join(' ')).toMatch(/underwriter/i);
  });

  it('declines a score below the floor, without referring it first', () => {
    const outcome = run({ creditScore: 480 });

    expect(outcome.decision).toBe(LoanDecision.DECLINE);
    expect(outcome.status).toBe(LoanApplicationStatus.DECLINED);
  });

  it('declines a debt-to-income ratio above the hard ceiling', () => {
    expect(run({ debtToIncomeBps: 7000 }).decision).toBe(LoanDecision.DECLINE);
  });

  it('declines when affordability leaves nothing to lend', () => {
    expect(run({ maxAmount: money('0.00').toJSON() }).decision).toBe(LoanDecision.DECLINE);
  });

  it('caps the approved amount at what is affordable', () => {
    const outcome = decide({
      product: requireProduct(),
      eligibility: eligibility({ maxAmount: money('5000.00').toJSON() }),
      requestedAmount: money('8000.00'),
      outstandingDocumentKinds: [],
    });

    expect(outcome.approvedAmount.equals(money('5000.00'))).toBe(true);
  });

  it('never offers more than was asked for', () => {
    const outcome = run();

    expect(outcome.approvedAmount.equals(money('8000.00'))).toBe(true);
  });

  it('does not repeat a reason when two rules point the same way', () => {
    const outcome = run({ creditScore: 620, debtToIncomeBps: 4800 });

    expect(new Set(outcome.reasons).size).toBe(outcome.reasons.length);
  });

  it('writes decline copy a customer can act on, with their right to reasons', () => {
    const outcome = run({ creditScore: 480 });

    expect(outcome.reasons.join(' ')).toMatch(/in writing/i);
  });
});
