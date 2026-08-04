/**
 * Amortisation: turning a principal, a rate and a term into an instalment table.
 *
 * The table is the product. A customer reads it, an underwriter checks it and the arrears
 * engine measures against it, so it has to reconcile exactly: the principal column sums to
 * the amount advanced, to the minor unit, and the final instalment absorbs every rounding
 * remainder rather than leaving a stray penny for the customer to find at settlement.
 *
 * All arithmetic is `bigint` fixed-point. The periodic rate is held at {@link RATE_SCALE}
 * and compounded step by step; `Money.scaleByRatio` performs the single explicit rounding
 * at the end of each division, so no intermediate value is ever a float.
 */

import { Money, RoundingMode } from '@reliance/money';

import { addMonths } from './calendar.js';
import { BPS_SCALE, MAX_TERM_MONTHS, MONTHS_PER_YEAR, RATE_SCALE } from './loan.constants.js';

/** One line of the instalment table, in domain `Money`. */
export interface ScheduleRow {
  /** 1-based instalment number. */
  readonly instalment: number;
  readonly dueDate: string;
  readonly openingBalance: Money;
  readonly payment: Money;
  readonly principal: Money;
  readonly interest: Money;
  readonly fees: Money;
  readonly closingBalance: Money;
}

/** A complete schedule and the totals a quote quotes. */
export interface AmortisationSchedule {
  readonly monthlyPayment: Money;
  readonly totalRepayable: Money;
  readonly totalInterest: Money;
  readonly rows: readonly ScheduleRow[];
}

/** What it takes to build a schedule. */
export interface ScheduleRequest {
  readonly principal: Money;
  readonly aprBps: number;
  readonly termMonths: number;
  /** Calendar date of instalment one; subsequent instalments fall monthly after it. */
  readonly firstPaymentDate: string;
}

/**
 * The monthly rate as a fixed-point fraction of {@link RATE_SCALE}.
 *
 * A nominal annual rate divided by twelve, which is the convention every instalment
 * product in the catalogue is priced and advertised on.
 */
export function monthlyRate(aprBps: number): bigint {
  return (BigInt(aprBps) * RATE_SCALE) / (BPS_SCALE * MONTHS_PER_YEAR);
}

/**
 * `(1 + r)^n`, in fixed point.
 *
 * Compounded iteratively rather than by exponentiation because the un-divided power of a
 * scaled rate over 480 periods is a number thousands of digits long. Dividing back to
 * scale each step keeps the operand small; at 18 decimal places the truncation over the
 * longest permitted term stays many orders of magnitude below one minor unit.
 */
export function compoundFactor(rate: bigint, periods: number): bigint {
  const onePlusRate = RATE_SCALE + rate;
  let factor = RATE_SCALE;

  for (let period = 0; period < periods; period += 1) {
    factor = (factor * onePlusRate) / RATE_SCALE;
  }

  return factor;
}

/**
 * The level instalment that clears `principal` over `termMonths` at `aprBps`.
 *
 * The standard annuity formula, `P·r·(1+r)ⁿ / ((1+r)ⁿ − 1)`, rounded half-up to the minor
 * unit. Half-up rather than half-even here on purpose: rounding the instalment up means
 * the balance runs down slightly faster than the formula predicts, so the final instalment
 * is never larger than the ones the customer has been paying all along.
 *
 * @throws {RangeError} when the term is outside the range the contract permits.
 */
export function annuityPayment(input: {
  principal: Money;
  aprBps: number;
  termMonths: number;
}): Money {
  assertTerm(input.termMonths);

  const rate = monthlyRate(input.aprBps);
  if (rate === 0n) {
    return input.principal.scaleByRatio(1n, BigInt(input.termMonths), RoundingMode.UP);
  }

  const factor = compoundFactor(rate, input.termMonths);
  return input.principal.scaleByRatio(
    rate * factor,
    RATE_SCALE * (factor - RATE_SCALE),
    RoundingMode.HALF_UP,
  );
}

/**
 * The largest principal whose instalment does not exceed `maxPayment`.
 *
 * The annuity formula inverted. Used by affordability: the bank decides what a customer
 * can pay each month and this says how much that buys.
 */
export function principalForPayment(input: {
  maxPayment: Money;
  aprBps: number;
  termMonths: number;
}): Money {
  assertTerm(input.termMonths);

  const rate = monthlyRate(input.aprBps);
  if (rate === 0n) return input.maxPayment.times(input.termMonths);

  const factor = compoundFactor(rate, input.termMonths);
  return input.maxPayment.scaleByRatio(
    RATE_SCALE * (factor - RATE_SCALE),
    rate * factor,
    RoundingMode.DOWN,
  );
}

/**
 * Builds the instalment table.
 *
 * Interest each period is charged on the opening balance; principal is whatever the level
 * payment leaves over. On the last row the principal is set to the balance outright and
 * the payment follows from it, which is what makes the principal column reconcile to the
 * penny however the intermediate roundings fell.
 *
 * @throws {RangeError} when the rate is so high that a level payment would never clear the
 *   debt — a mispriced product, and one the bank must not be able to sell.
 */
export function buildSchedule(request: ScheduleRequest): AmortisationSchedule {
  const payment = annuityPayment(request);
  const rate = monthlyRate(request.aprBps);
  const zero = Money.zero(request.principal.currency);

  const rows: ScheduleRow[] = [];
  let balance = request.principal;

  for (let instalment = 1; instalment <= request.termMonths; instalment += 1) {
    const interest = balance.scaleByRatio(rate, RATE_SCALE, RoundingMode.HALF_UP);
    const isFinal = instalment === request.termMonths;
    const row = buildRow({ instalment, request, balance, interest, payment, isFinal, zero });

    rows.push(row);
    balance = row.closingBalance;
  }

  return {
    monthlyPayment: payment,
    totalRepayable: sumOf(rows, (row) => row.payment, zero),
    totalInterest: sumOf(rows, (row) => row.interest, zero),
    rows,
  };
}

/**
 * One row, and the decision about whether it is the one that absorbs the rounding.
 *
 * A row is treated as final either because it is the last of the term or because the level
 * payment would over-repay what is left. The second case cannot arise from a correctly
 * priced annuity, but clamping is cheap and a schedule that drove the balance negative
 * would be a far more expensive bug than the branch that prevents it.
 */
function buildRow(input: {
  instalment: number;
  request: ScheduleRequest;
  balance: Money;
  interest: Money;
  payment: Money;
  isFinal: boolean;
  zero: Money;
}): ScheduleRow {
  const scheduledPrincipal = input.payment.minus(input.interest);
  const settles = input.isFinal || scheduledPrincipal.greaterThanOrEqual(input.balance);

  if (!settles && !scheduledPrincipal.isPositive) {
    throw new RangeError(
      'This rate and term produce an instalment smaller than the interest it accrues, ' +
        'so the balance would never reduce. The product is mispriced.',
    );
  }

  const principal = settles ? input.balance : scheduledPrincipal;

  return {
    instalment: input.instalment,
    dueDate: addMonths(input.request.firstPaymentDate, input.instalment - 1),
    openingBalance: input.balance,
    payment: principal.plus(input.interest),
    principal,
    interest: input.interest,
    fees: input.zero,
    closingBalance: input.balance.minus(principal),
  };
}

function sumOf(
  rows: readonly ScheduleRow[],
  pick: (row: ScheduleRow) => Money,
  zero: Money,
): Money {
  return rows.reduce((total, row) => total.plus(pick(row)), zero);
}

function assertTerm(termMonths: number): void {
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > MAX_TERM_MONTHS) {
    throw new RangeError(`A term of ${termMonths} months cannot be scheduled.`);
  }
}
