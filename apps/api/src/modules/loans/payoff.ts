/**
 * Settling early: what the customer pays today to owe nothing tomorrow.
 *
 * A settlement figure is the outstanding principal, plus interest for the days it has
 * actually been outstanding since the last instalment, plus whatever early-repayment
 * charge the product carries — and *minus* the interest built into the remaining
 * instalments that will now never be earned. That last figure is the rebate, and quoting a
 * payoff without it would charge the customer for a loan they are not going to have.
 *
 * The rebate is actuarial rather than Rule-of-78: it is the arithmetic difference between
 * the scheduled future interest and the interest genuinely accrued to the settlement date,
 * which is the only method that leaves the customer no worse off for settling early.
 */

import { Money, RoundingMode } from '@reliance/money';

import { fromStored } from '../../common/money/money.codec.js';

import { arrearsAmount, unpaidPortion } from './arrears.js';
import { daysBetween } from './calendar.js';
import { BPS_SCALE, DAYS_PER_YEAR } from './loan.constants.js';
import { type LoanRecord, type ScheduleRowRecord } from './loan.store.js';

/** A settlement figure, broken into the parts a customer is entitled to see. */
export interface PayoffFigures {
  readonly outstandingPrincipal: Money;
  /** Interest earned since the last instalment fell due, on an actual/365 basis. */
  readonly accruedInterest: Money;
  readonly earlyRepaymentFee: Money;
  /** Scheduled interest the customer will not pay because the loan ends today. */
  readonly interestRebate: Money;
  /** Arrears and unpaid fees, which settlement must also clear. */
  readonly arrears: Money;
  readonly totalPayable: Money;
}

/** What the calculation needs beyond the loan itself. */
export interface PayoffRequest {
  readonly loan: LoanRecord;
  /** Business date the figure is quoted for. */
  readonly asOf: string;
  readonly earlyRepaymentFeeBps: number;
}

/**
 * The settlement figure for a loan on a given business date.
 *
 * @throws {import('@reliance/money').CurrencyMismatchError} if the loan's stored amounts
 *   disagree on currency, which would mean the record itself is corrupt.
 */
export function payoffFigures(request: PayoffRequest): PayoffFigures {
  const { loan, asOf } = request;
  const outstandingPrincipal = fromStored(loan.outstandingPrincipal);
  const currency = outstandingPrincipal.currency;

  const accruedInterest = accrueSinceLastInstalment(loan, asOf);
  const earlyRepaymentFee = outstandingPrincipal.scaleByRatio(
    BigInt(request.earlyRepaymentFeeBps),
    BPS_SCALE,
  );
  const arrears = arrearsAmount(loan.schedule, asOf, currency);
  const interestRebate = scheduledFutureInterest(loan.schedule, asOf).minus(accruedInterest);

  return {
    outstandingPrincipal,
    accruedInterest,
    earlyRepaymentFee,
    interestRebate: interestRebate.isPositive ? interestRebate : Money.zero(currency),
    arrears,
    totalPayable: outstandingPrincipal
      .plus(accruedInterest)
      .plus(earlyRepaymentFee)
      .plus(arrears)
      .plus(fromStored(loan.feesOutstanding)),
  };
}

/**
 * Interest earned on the outstanding principal since the last instalment date.
 *
 * Daily, actual/365, because a settlement can land on any date and monthly interest would
 * either overcharge a customer settling on the 2nd or undercharge one settling on the
 * 29th. Rounded down: where the day count leaves a fraction of a penny, the customer keeps
 * it.
 */
export function accrueSinceLastInstalment(loan: LoanRecord, asOf: string): Money {
  const outstanding = fromStored(loan.outstandingPrincipal);
  const days = daysBetween(accrualStartDate(loan, asOf), asOf);
  if (days <= 0) return Money.zero(outstanding.currency);

  return outstanding.scaleByRatio(
    BigInt(loan.aprBps) * BigInt(days),
    BPS_SCALE * DAYS_PER_YEAR,
    RoundingMode.DOWN,
  );
}

/**
 * Interest sitting in instalments that have not yet fallen due.
 *
 * Instalments already past their due date are excluded whether or not they were paid: the
 * interest in them has been earned, and rebating it would hand back money the bank is owed
 * rather than money it is not.
 */
export function scheduledFutureInterest(
  schedule: readonly ScheduleRowRecord[],
  asOf: string,
): Money {
  const zero = zeroFrom(schedule);

  return schedule
    .filter((row) => row.dueDate > asOf)
    .reduce((total, row) => total.plus(fromStored(row.interest)), zero);
}

/** Total the customer still owes across every unsettled instalment, fees included. */
export function remainingContractualTotal(schedule: readonly ScheduleRowRecord[]): Money {
  return schedule.reduce((total, row) => total.plus(unpaidPortion(row)), zeroFrom(schedule));
}

/**
 * Where daily accrual starts: the most recent due date that has passed, or drawdown.
 *
 * Using the last *due* date rather than the last *paid* date is deliberate. Interest on an
 * instalment already charged to the account is carried in `interestOutstanding`; accruing
 * from the payment date as well would charge for the same days twice.
 */
function accrualStartDate(loan: LoanRecord, asOf: string): string {
  const passed = loan.schedule.filter((row) => row.dueDate <= asOf);
  const latest = passed.at(-1);
  return latest ? latest.dueDate : isoOf(loan.disbursedAt);
}

function zeroFrom(schedule: readonly ScheduleRowRecord[]): Money {
  const first = schedule[0];
  if (!first) throw new RangeError('A loan cannot have an empty instalment schedule.');
  return Money.zero(fromStored(first.payment).currency);
}

const ISO_DATE_LENGTH = 10;

function isoOf(instant: Date): string {
  return instant.toISOString().slice(0, ISO_DATE_LENGTH);
}
