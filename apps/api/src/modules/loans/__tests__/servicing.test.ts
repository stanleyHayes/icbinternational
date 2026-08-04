import { Money } from '@reliance/money';

import { fromStored, toStored } from '../../../common/money/money.codec.js';
import { allocatedTotal } from '../payment-allocation.js';
import { accrueSinceLastInstalment, payoffFigures, scheduledFutureInterest } from '../payoff.js';
import { applyPayment, outstandingBuckets } from '../repayment.js';
import { OverpaymentEffect, maturedPrincipal, rebuildTail } from '../restructure.js';

import { aLoan, FIXTURE_CURRENCY, withInstalmentsPaid } from './loan-fixtures.js';

/**
 * Servicing arithmetic: applying a payment, settling early, and rebuilding the tail.
 *
 * These three are tested together because they compose — an overpayment allocates, then
 * reschedules, and a settlement figure has to agree with what a full repayment would
 * actually clear. Testing them apart lets each be right and the combination be wrong.
 */

const PAID_AT = new Date('2026-03-16T10:00:00.000Z');

function money(major: string): Money {
  return Money.fromMajor(major, FIXTURE_CURRENCY);
}

function instalmentOf(loan: ReturnType<typeof aLoan>): Money {
  return fromStored(loan.monthlyPayment);
}

describe('outstandingBuckets', () => {
  it('counts nothing before the first instalment falls due', () => {
    const buckets = outstandingBuckets(aLoan(), '2026-01-20');

    expect(buckets.fees.isZero).toBe(true);
    expect(buckets.interest.isZero).toBe(true);
  });

  it('counts interest only once its instalment has matured', () => {
    const loan = aLoan();
    const buckets = outstandingBuckets(loan, '2026-02-16');
    const firstInterest = fromStored(loan.schedule[0]?.interest ?? loan.monthlyPayment);

    expect(buckets.interest.equals(firstInterest)).toBe(true);
  });

  it('always reports the whole principal, which a settlement may clear at any time', () => {
    const loan = aLoan();

    expect(
      outstandingBuckets(loan, '2026-01-20').principal.equals(fromStored(loan.principal)),
    ).toBe(true);
  });
});

describe('applyPayment', () => {
  it('clears one instalment exactly', () => {
    const loan = aLoan();
    const outcome = applyPayment({
      loan,
      payment: instalmentOf(loan),
      asOf: '2026-02-16',
      paidAt: PAID_AT,
    });

    expect(outcome.schedule[0]?.status).toBe('PAID');
    expect(outcome.settled).toBe(false);
  });

  it('marks a part payment PARTIAL rather than rounding it to paid or missed', () => {
    const loan = aLoan();
    const outcome = applyPayment({
      loan,
      payment: money('100.00'),
      asOf: '2026-02-16',
      paidAt: PAID_AT,
    });

    expect(outcome.schedule[0]?.status).toBe('PARTIAL');
  });

  it('clears the oldest missed instalment first, so days past due actually fall', () => {
    const loan = aLoan();
    const outcome = applyPayment({
      loan,
      payment: instalmentOf(loan),
      asOf: '2026-04-16',
      paidAt: PAID_AT,
    });

    expect(outcome.schedule[0]?.status).toBe('PAID');
    expect(outcome.schedule[1]?.status).not.toBe('PAID');
  });

  it('reduces the outstanding principal by exactly what went to principal', () => {
    const loan = aLoan();
    const outcome = applyPayment({
      loan,
      payment: instalmentOf(loan),
      asOf: '2026-02-16',
      paidAt: PAID_AT,
    });

    const expected = fromStored(loan.outstandingPrincipal).minus(outcome.allocation.toPrincipal);
    expect(outcome.outstandingPrincipal.equals(expected)).toBe(true);
  });

  it('never collects more than is owed', () => {
    const loan = aLoan();
    const outcome = applyPayment({
      loan,
      payment: money('99999.00'),
      asOf: '2026-02-16',
      paidAt: PAID_AT,
    });

    expect(allocatedTotal(outcome.allocation).lessThan(money('99999.00'))).toBe(true);
    expect(outcome.allocation.unallocated.isPositive).toBe(true);
  });

  it('settles the loan when the last of the principal is cleared', () => {
    const loan = aLoan();
    const outcome = applyPayment({
      loan,
      payment: fromStored(loan.principal).plus(money('500.00')),
      asOf: '2026-02-16',
      paidAt: PAID_AT,
    });

    expect(outcome.settled).toBe(true);
    expect(outcome.outstandingPrincipal.isZero).toBe(true);
  });
});

describe('rebuildTail', () => {
  it('shortens the term and holds the instalment under REDUCE_TERM', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const outstanding = fromStored(loan.outstandingPrincipal).minus(money('3000.00'));

    const rebuilt = rebuildTail({
      schedule: loan.schedule,
      outstanding,
      aprBps: loan.aprBps,
      asOf: '2026-04-16',
      monthlyPayment: instalmentOf(loan),
      effect: OverpaymentEffect.REDUCE_TERM,
    });

    expect(rebuilt.monthlyPayment.equals(instalmentOf(loan))).toBe(true);
    expect(rebuilt.termMonths).toBeLessThan(loan.schedule.length);
  });

  it('holds the term and lowers the instalment under REDUCE_INSTALMENT', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const outstanding = fromStored(loan.outstandingPrincipal).minus(money('3000.00'));

    const rebuilt = rebuildTail({
      schedule: loan.schedule,
      outstanding,
      aprBps: loan.aprBps,
      asOf: '2026-04-16',
      monthlyPayment: instalmentOf(loan),
      effect: OverpaymentEffect.REDUCE_INSTALMENT,
    });

    expect(rebuilt.termMonths).toBe(loan.schedule.length);
    expect(rebuilt.monthlyPayment.lessThan(instalmentOf(loan))).toBe(true);
  });

  it('reconciles the new tail to the outstanding balance exactly', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const outstanding = fromStored(loan.outstandingPrincipal).minus(money('3000.00'));

    const rebuilt = rebuildTail({
      schedule: loan.schedule,
      outstanding,
      aprBps: loan.aprBps,
      asOf: '2026-04-16',
      monthlyPayment: instalmentOf(loan),
      effect: OverpaymentEffect.REDUCE_TERM,
    });

    const tail = rebuilt.schedule.filter((row) => row.dueDate > '2026-04-16');
    const principalSum = tail.reduce(
      (total, row) => total.plus(fromStored(row.principal)),
      Money.zero(FIXTURE_CURRENCY),
    );

    expect(principalSum.equals(outstanding)).toBe(true);
  });

  it('leaves instalments that have already fallen due untouched', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const before = loan.schedule.slice(0, 3).map((row) => row.payment.amount);

    const rebuilt = rebuildTail({
      schedule: loan.schedule,
      outstanding: fromStored(loan.outstandingPrincipal),
      aprBps: loan.aprBps,
      asOf: '2026-04-16',
      monthlyPayment: instalmentOf(loan),
      effect: OverpaymentEffect.REDUCE_INSTALMENT,
    });

    expect(rebuilt.schedule.slice(0, 3).map((row) => row.payment.amount)).toEqual(before);
  });

  it('grows no new instalments once the balance is gone', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);

    const rebuilt = rebuildTail({
      schedule: loan.schedule,
      outstanding: Money.zero(FIXTURE_CURRENCY),
      aprBps: loan.aprBps,
      asOf: '2026-04-16',
      monthlyPayment: instalmentOf(loan),
      effect: OverpaymentEffect.REDUCE_TERM,
    });

    expect(rebuilt.schedule.every((row) => row.dueDate <= '2026-04-16')).toBe(true);
  });
});

describe('maturedPrincipal', () => {
  it('sums the principal in instalments that have already fallen due', () => {
    const loan = aLoan();
    const matured = maturedPrincipal({
      schedule: loan.schedule,
      asOf: '2026-04-16',
      currency: FIXTURE_CURRENCY,
    });

    const expected = loan.schedule
      .slice(0, 3)
      .reduce((total, row) => total.plus(fromStored(row.principal)), Money.zero(FIXTURE_CURRENCY));

    expect(matured.equals(expected)).toBe(true);
  });
});

describe('payoffFigures', () => {
  it('rebates the interest built into instalments that have not fallen due', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const figures = payoffFigures({ loan, asOf: '2026-04-16', earlyRepaymentFeeBps: 0 });

    expect(figures.interestRebate.isPositive).toBe(true);
    expect(
      figures.interestRebate.lessThan(scheduledFutureInterest(loan.schedule, '2026-04-16')),
    ).toBe(true);
  });

  it('charges interest only for the days since the last instalment fell due', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const nextDay = payoffFigures({ loan, asOf: '2026-04-16', earlyRepaymentFeeBps: 0 });
    const aMonthLater = payoffFigures({ loan, asOf: '2026-05-10', earlyRepaymentFeeBps: 0 });

    expect(aMonthLater.accruedInterest.greaterThan(nextDay.accruedInterest)).toBe(true);
  });

  it('applies the product’s early repayment charge to the outstanding principal', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const figures = payoffFigures({ loan, asOf: '2026-04-16', earlyRepaymentFeeBps: 100 });

    const expected = fromStored(loan.outstandingPrincipal).scaleByRatio(100n, 10_000n);
    expect(figures.earlyRepaymentFee.equals(expected)).toBe(true);
  });

  it('charges nothing extra on a product with no early repayment fee', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const figures = payoffFigures({ loan, asOf: '2026-04-16', earlyRepaymentFeeBps: 0 });

    expect(figures.earlyRepaymentFee.isZero).toBe(true);
  });

  it('totals to principal plus accrued interest plus the charge plus arrears', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const figures = payoffFigures({ loan, asOf: '2026-04-16', earlyRepaymentFeeBps: 100 });

    const expected = figures.outstandingPrincipal
      .plus(figures.accruedInterest)
      .plus(figures.earlyRepaymentFee)
      .plus(figures.arrears);

    expect(figures.totalPayable.equals(expected)).toBe(true);
  });

  it('settles for less than carrying the loan to term would cost', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);
    const figures = payoffFigures({ loan, asOf: '2026-04-16', earlyRepaymentFeeBps: 0 });

    const toTerm = fromStored(loan.outstandingPrincipal).plus(
      scheduledFutureInterest(loan.schedule, '2026-04-16'),
    );
    expect(figures.totalPayable.lessThan(toTerm)).toBe(true);
  });

  it('includes unpaid arrears, so settling actually closes the account', () => {
    const behind = aLoan({ feesOutstanding: toStored(money('12.00')) });
    const figures = payoffFigures({ loan: behind, asOf: '2026-05-16', earlyRepaymentFeeBps: 0 });

    expect(figures.arrears.isPositive).toBe(true);
  });
});

describe('accrueSinceLastInstalment', () => {
  it('accrues nothing on the day an instalment falls due', () => {
    const loan = withInstalmentsPaid(aLoan(), 3);

    expect(accrueSinceLastInstalment(loan, '2026-04-15').isZero).toBe(true);
  });

  it('accrues from drawdown before the first instalment', () => {
    expect(accrueSinceLastInstalment(aLoan(), '2026-01-31').isPositive).toBe(true);
  });
});
