/**
 * The loan repayment calculator behind the public site.
 *
 * The site's figures have to match what the customer is actually offered, so this computes
 * the schedule the same way the lending lane does: integer minor units throughout, monthly
 * interest accrued on the outstanding balance, and the final instalment adjusted to clear
 * the balance exactly rather than leaving a penny behind.
 *
 * Rates are basis points — hundredths of a percent, as integers. There is no float in this
 * file and there must never be one: a published "representative example" is a regulated
 * statement, and it has to agree with the agreement.
 *
 * Pure.
 */

import { Money, type CurrencyCode } from '@reliance/money';

const MONTHS_PER_YEAR = 12n;
const BASIS_POINTS_PER_UNIT = 10_000n;
/** Newton's method converges on the monthly payment in far fewer than this many passes. */
const MAX_SOLVER_ITERATIONS = 64;

export interface LoanQuoteInput {
  readonly principalMinorUnits: bigint;
  readonly annualRateBasisPoints: number;
  readonly termMonths: number;
  readonly currency: CurrencyCode;
}

export interface Instalment {
  readonly month: number;
  readonly paymentMinorUnits: bigint;
  readonly interestMinorUnits: bigint;
  readonly principalMinorUnits: bigint;
  readonly balanceMinorUnits: bigint;
}

export interface LoanQuote {
  readonly monthlyPayment: Money;
  readonly totalRepayable: Money;
  readonly totalInterest: Money;
  readonly schedule: readonly Instalment[];
}

/**
 * Monthly interest on a balance, rounded half-up to the minor unit.
 *
 * Half-up rather than banker's rounding because that is what a repayment schedule
 * conventionally uses, and a schedule that disagrees with the customer's by a penny is a
 * complaint.
 */
function monthlyInterest(balance: bigint, annualRateBasisPoints: bigint): bigint {
  if (balance <= 0n || annualRateBasisPoints <= 0n) return 0n;

  const numerator = balance * annualRateBasisPoints;
  const denominator = BASIS_POINTS_PER_UNIT * MONTHS_PER_YEAR;
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * The balance left after paying `payment` every month for the whole term.
 *
 * Positive means the payment is too small to clear the loan; negative means it is larger
 * than it needs to be. This is what the solver bisects on, and it deliberately does *not*
 * apply the final-instalment adjustment — a schedule that forces the last payment to clear
 * whatever remains always ends at zero, which would make the residual useless as a signal.
 */
function residualAfter(input: LoanQuoteInput, payment: bigint): bigint {
  const rate = BigInt(input.annualRateBasisPoints);
  let balance = input.principalMinorUnits;

  for (let month = 0; month < input.termMonths; month += 1) {
    balance = balance + monthlyInterest(balance, rate) - payment;
  }

  return balance;
}

/**
 * Builds the schedule for the solved payment.
 *
 * The last instalment absorbs whatever remains, which is how a real schedule ends and why
 * the final payment is often a few pence different from the others.
 */
function amortise(input: LoanQuoteInput, payment: bigint): Instalment[] {
  const rate = BigInt(input.annualRateBasisPoints);
  const schedule: Instalment[] = [];
  let balance = input.principalMinorUnits;

  for (let month = 1; month <= input.termMonths; month += 1) {
    const interest = monthlyInterest(balance, rate);
    const isLast = month === input.termMonths;
    const due = isLast ? balance + interest : payment;
    const principal = due - interest;

    balance -= principal;
    schedule.push({
      month,
      paymentMinorUnits: due,
      interestMinorUnits: interest,
      principalMinorUnits: principal,
      balanceMinorUnits: balance > 0n ? balance : 0n,
    });
  }

  return schedule;
}

/**
 * Solves for the level monthly payment by bisection on integer minor units.
 *
 * Bisection rather than the closed-form annuity formula, because the closed form needs
 * `Math.pow` on a float and the whole point of this file is that no float touches the
 * figure. The search space is bounded and integral, so it terminates in a few dozen
 * passes with an exact answer rather than a rounded one.
 */
function solvePayment(input: LoanQuoteInput): bigint {
  // The upper bound clears the loan in one payment, so it is certainly large enough.
  let low = 1n;
  let high =
    input.principalMinorUnits +
    monthlyInterest(input.principalMinorUnits, BigInt(input.annualRateBasisPoints)) *
      BigInt(input.termMonths) +
    1n;

  for (let pass = 0; pass < MAX_SOLVER_ITERATIONS && low < high; pass += 1) {
    const candidate = (low + high) / 2n;

    if (residualAfter(input, candidate) > 0n) low = candidate + 1n;
    else high = candidate;
  }

  return high;
}

/**
 * Quotes a loan.
 *
 * @throws {RangeError} on a term or principal that cannot produce a schedule. Callers
 *   validate first; this is the last line of defence rather than the error a customer sees.
 */
export function quoteLoan(input: LoanQuoteInput): LoanQuote {
  if (input.termMonths <= 0) throw new RangeError('A loan term must be at least one month');
  if (input.principalMinorUnits <= 0n) throw new RangeError('A loan must be for a positive amount');

  const payment = solvePayment(input);
  const schedule = amortise(input, payment);

  const totalRepayable = schedule.reduce((total, entry) => total + entry.paymentMinorUnits, 0n);

  return {
    monthlyPayment: Money.fromMinor(payment, input.currency),
    totalRepayable: Money.fromMinor(totalRepayable, input.currency),
    totalInterest: Money.fromMinor(totalRepayable - input.principalMinorUnits, input.currency),
    schedule,
  };
}
