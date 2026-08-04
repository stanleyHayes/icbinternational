/**
 * Applying a payment to a loan: which buckets it fills and what the schedule looks like
 * afterwards.
 *
 * Pure, and separated from the service that posts the entry, because this is the part with
 * arithmetic in it. The service decides whether a payment may happen; this decides what it
 * means. Every figure the caller needs to persist comes back in one value, so a repayment
 * cannot half-update a loan.
 */

import { Money } from '@reliance/money';

import { fromStored, toStored } from '../../common/money/money.codec.js';

import { unpaidPortion } from './arrears.js';
import { type LoanRecord, type ScheduleRowRecord } from './loan.store.js';
import {
  allocatePayment,
  allocatedTotal,
  type OutstandingAmounts,
  type PaymentAllocation,
} from './payment-allocation.js';

/** Everything a repayment changes. */
export interface RepaymentOutcome {
  readonly allocation: PaymentAllocation;
  readonly schedule: readonly ScheduleRowRecord[];
  readonly outstandingPrincipal: Money;
  readonly feesOutstanding: Money;
  readonly interestOutstanding: Money;
  /** True when the payment cleared the last of the principal. */
  readonly settled: boolean;
}

/**
 * What is owed right now, split into the buckets a payment fills in order.
 *
 * Interest counts as owed only once its instalment has fallen due. Interest sitting in a
 * future instalment has not been earned, and letting a payment settle it would charge the
 * customer for time they have not yet had the money for.
 */
export function outstandingBuckets(loan: LoanRecord, asOf: string): OutstandingAmounts {
  const principal = fromStored(loan.outstandingPrincipal);
  const currency = principal.currency;
  const matured = loan.schedule.filter((row) => row.dueDate <= asOf && !isSettled(row));

  return {
    fees: sum(
      matured.map((row) => unpaidFees(row)),
      currency,
    ),
    interest: sum(
      matured.map((row) => unpaidInterest(row)),
      currency,
    ),
    principal,
  };
}

/**
 * Applies a payment and returns the loan's new position.
 *
 * The pot is spread over instalments oldest first, which matters when a customer in
 * arrears makes one payment covering two missed months: the older instalment clears first,
 * so days past due falls rather than the arrears merely shrinking.
 */
export function applyPayment(input: {
  loan: LoanRecord;
  payment: Money;
  asOf: string;
  paidAt: Date;
}): RepaymentOutcome {
  const { loan, payment, asOf, paidAt } = input;
  const allocation = allocatePayment(payment, outstandingBuckets(loan, asOf));
  const schedule = fillOldestFirst(loan.schedule, allocatedTotal(allocation), paidAt);

  const principalBefore = fromStored(loan.outstandingPrincipal);
  const outstandingPrincipal = principalBefore.minus(allocation.toPrincipal);
  const currency = principalBefore.currency;

  return {
    allocation,
    schedule,
    outstandingPrincipal,
    feesOutstanding: sum(
      schedule.map((row) => unpaidFees(row)),
      currency,
    ),
    interestOutstanding: sum(
      schedule.filter((row) => row.dueDate <= asOf).map((row) => unpaidInterest(row)),
      currency,
    ),
    settled: !outstandingPrincipal.isPositive,
  };
}

/**
 * Distributes a pot across the schedule, oldest unsettled instalment first.
 *
 * A row is marked `PAID` only when the whole of it — instalment and any late fee — has
 * been met. `PARTIAL` is a real state a customer can sit in for a month, and collapsing it
 * into either neighbour would either overstate arrears or understate them.
 */
function fillOldestFirst(
  schedule: readonly ScheduleRowRecord[],
  pot: Money,
  paidAt: Date,
): ScheduleRowRecord[] {
  let remaining = pot;

  return schedule.map((row) => {
    const owed = unpaidPortion(row);
    if (!remaining.isPositive || !owed.isPositive) return row;

    const applied = remaining.lessThan(owed) ? remaining : owed;
    remaining = remaining.minus(applied);
    const paidAmount = fromStored(row.paidAmount).plus(applied);
    const cleared = applied.equals(owed);

    return {
      ...row,
      paidAmount: toStored(paidAmount),
      status: cleared ? 'PAID' : 'PARTIAL',
      paidAt: cleared ? paidAt : row.paidAt,
    };
  });
}

/** Whether an instalment owes nothing further. */
export function isSettled(row: ScheduleRowRecord): boolean {
  return row.status === 'PAID' || row.status === 'WAIVED';
}

/**
 * The unpaid fee on a row.
 *
 * Fees are the first bucket a payment fills, so anything already applied to this row is
 * treated as having gone to the fee before it went to interest or principal — the same
 * order the allocation rule states, applied within the row as well as across the loan.
 */
function unpaidFees(row: ScheduleRowRecord): Money {
  return shortfall(fromStored(row.fees), fromStored(row.paidAmount));
}

/** The unpaid interest on a row, after any part of the payment that went to its fee. */
function unpaidInterest(row: ScheduleRowRecord): Money {
  const fees = fromStored(row.fees);
  const appliedBeyondFees = shortfall(fromStored(row.paidAmount), fees);
  return shortfall(fromStored(row.interest), appliedBeyondFees);
}

function shortfall(owed: Money, covered: Money): Money {
  const gap = owed.minus(covered);
  return gap.isPositive ? gap : Money.zero(owed.currency);
}

function sum(amounts: readonly Money[], currency: Money['currency']): Money {
  return amounts.reduce((total, amount) => total.plus(amount), Money.zero(currency));
}
