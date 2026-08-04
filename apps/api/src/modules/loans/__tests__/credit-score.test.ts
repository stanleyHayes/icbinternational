import { Money } from '@reliance/money';

import { creditScoreFor, debtToIncomeBps, type CreditProfile } from '../credit-score.js';
import { MAX_CREDIT_SCORE, MIN_CREDIT_SCORE } from '../loan.constants.js';

/**
 * The scorecard, exercised for the two properties the rest of lending depends on.
 *
 * **Determinism** — the same profile must always produce the same score, or every test of
 * the decision engine becomes a coin toss and no decline can be explained.
 *
 * **Monotonicity** — improving one dimension must never lower the score. A model that can
 * punish a customer for earning more is a model nobody can defend to a regulator.
 */

const GBP = 'GBP';

function money(major: string): Money {
  return Money.fromMajor(major, GBP);
}

const TYPICAL: CreditProfile = {
  monthlyIncome: money('3200.00'),
  monthlyDebtPayments: money('450.00'),
  employmentMonths: 30,
  monthsWithBank: 18,
  missedPaymentsLast24Months: 0,
  openLoanCount: 1,
  kycTier: 2,
  hasDefaultHistory: false,
};

describe('debtToIncomeBps', () => {
  it('expresses commitments over income in basis points', () => {
    // £450 of £3,200 is 14.06%.
    expect(debtToIncomeBps(TYPICAL)).toBe(1406);
  });

  it('is nil for a customer with no other commitments', () => {
    expect(debtToIncomeBps({ ...TYPICAL, monthlyDebtPayments: money('0.00') })).toBe(0);
  });

  it('treats no recorded income as the worst measurable ratio, not the best', () => {
    const unemployed = { ...TYPICAL, monthlyIncome: money('0.00') };

    expect(debtToIncomeBps(unemployed)).toBeGreaterThan(10_000);
  });
});

describe('creditScoreFor', () => {
  it('returns the same score for the same profile, every time', () => {
    const scores = Array.from({ length: 50 }, () => creditScoreFor(TYPICAL));

    expect(new Set(scores).size).toBe(1);
  });

  it('stays inside the range the contract permits', () => {
    const best: CreditProfile = {
      monthlyIncome: money('20000.00'),
      monthlyDebtPayments: money('0.00'),
      employmentMonths: 400,
      monthsWithBank: 400,
      missedPaymentsLast24Months: 0,
      openLoanCount: 0,
      kycTier: 3,
      hasDefaultHistory: false,
    };
    const worst: CreditProfile = {
      monthlyIncome: money('400.00'),
      monthlyDebtPayments: money('600.00'),
      employmentMonths: 0,
      monthsWithBank: 0,
      missedPaymentsLast24Months: 12,
      openLoanCount: 9,
      kycTier: 0,
      hasDefaultHistory: true,
    };

    expect(creditScoreFor(best)).toBe(MAX_CREDIT_SCORE);
    expect(creditScoreFor(worst)).toBe(MIN_CREDIT_SCORE);
  });

  const improvements: { name: string; better: Partial<CreditProfile> }[] = [
    { name: 'a higher income', better: { monthlyIncome: money('6000.00') } },
    { name: 'fewer commitments', better: { monthlyDebtPayments: money('100.00') } },
    { name: 'longer in the job', better: { employmentMonths: 72 } },
    { name: 'longer with the bank', better: { monthsWithBank: 72 } },
    { name: 'fewer loans already open', better: { openLoanCount: 0 } },
    { name: 'a higher identity tier', better: { kycTier: 3 } },
  ];

  it.each(improvements)('never scores lower for $name', ({ better }) => {
    expect(creditScoreFor({ ...TYPICAL, ...better })).toBeGreaterThanOrEqual(
      creditScoreFor(TYPICAL),
    );
  });

  it('penalises missed payments, and penalises more of them harder', () => {
    const one = creditScoreFor({ ...TYPICAL, missedPaymentsLast24Months: 1 });
    const three = creditScoreFor({ ...TYPICAL, missedPaymentsLast24Months: 3 });

    expect(one).toBeLessThan(creditScoreFor(TYPICAL));
    expect(three).toBeLessThan(one);
  });

  it('penalises a recorded default heavily', () => {
    const defaulted = creditScoreFor({ ...TYPICAL, hasDefaultHistory: true });

    expect(creditScoreFor(TYPICAL) - defaulted).toBeGreaterThanOrEqual(100);
  });

  it('reads income in major units, so a JPY salary is not scored as if it were pence', () => {
    const yen: CreditProfile = {
      ...TYPICAL,
      monthlyIncome: Money.fromMinor('500000', 'JPY'),
      monthlyDebtPayments: Money.fromMinor('0', 'JPY'),
    };

    // JPY has no minor unit, so ¥500,000 is 500,000 major units — the top income band.
    expect(creditScoreFor(yen)).toBeGreaterThan(creditScoreFor(TYPICAL));
  });
});
