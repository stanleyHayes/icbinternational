/**
 * Rebuilding the future of a schedule.
 *
 * Three events invalidate the instalments that have not yet fallen due: an overpayment, an
 * agreed change of term or rate, and a formal restructure of a loan in difficulty. All
 * three come down to the same operation — keep the history, regenerate the tail from the
 * balance that is actually outstanding — so there is one implementation of it.
 *
 * History is never touched. Instalments already due keep their original figures whether or
 * not they were paid, because a customer's statement for last month must not change
 * because of something agreed this month.
 */

import { Money, RoundingMode } from '@reliance/money';

import { fromStored, toStored } from '../../common/money/money.codec.js';

import { annuityPayment, monthlyRate } from './amortisation.js';
import { addMonths } from './calendar.js';
import { MAX_TERM_MONTHS, RATE_SCALE } from './loan.constants.js';
import { type ScheduleRowRecord } from './loan.store.js';
import { isSettled } from './repayment.js';

/** What an overpayment does to the instalments that remain. */
export const OverpaymentEffect = {
  /** Keep paying the same amount and finish sooner. Cheapest for the customer. */
  REDUCE_TERM: 'REDUCE_TERM',
  /** Keep the same end date and pay less each month. Eases monthly pressure. */
  REDUCE_INSTALMENT: 'REDUCE_INSTALMENT',
} as const;
export type OverpaymentEffect = (typeof OverpaymentEffect)[keyof typeof OverpaymentEffect];

/** A rebuilt tail and the instalment that now goes with it. */
export interface RebuiltSchedule {
  readonly schedule: readonly ScheduleRowRecord[];
  readonly monthlyPayment: Money;
  readonly termMonths: number;
  readonly maturesOn: string;
}

/** What the rebuild needs. */
export interface RebuildRequest {
  readonly schedule: readonly ScheduleRowRecord[];
  readonly outstanding: Money;
  readonly aprBps: number;
  /** Business date; instalments due on or before it are history. */
  readonly asOf: string;
  readonly monthlyPayment: Money;
  readonly effect: OverpaymentEffect;
  /**
   * How many instalments the tail should have, when that is being changed deliberately.
   *
   * Omitted for an overpayment, where the remaining count is simply whatever the schedule
   * still holds. Supplied by a restructure, which is precisely the act of choosing a new
   * one.
   */
  readonly remainingInstalments?: number;
}

/**
 * Regenerates the unsettled tail of a schedule against a new outstanding balance.
 *
 * Under `REDUCE_TERM` the instalment is held and rows are emitted until the balance
 * clears, so the loan simply ends earlier. Under `REDUCE_INSTALMENT` the number of
 * remaining instalments is held and the payment is recomputed, so the end date stands.
 */
export function rebuildTail(request: RebuildRequest): RebuiltSchedule {
  const history = request.schedule.filter((row) => row.dueDate <= request.asOf || isSettled(row));
  const remainingCount = request.remainingInstalments ?? request.schedule.length - history.length;
  const firstDueDate = nextDueDate(request, history);

  if (!request.outstanding.isPositive || remainingCount <= 0) {
    return settledResult(history, request, firstDueDate);
  }

  const payment =
    request.effect === OverpaymentEffect.REDUCE_INSTALMENT
      ? annuityPayment({
          principal: request.outstanding,
          aprBps: request.aprBps,
          termMonths: remainingCount,
        })
      : request.monthlyPayment;

  const tail = emitRows({
    ...request,
    firstDueDate,
    payment,
    startNumber: history.length + 1,
    // Under REDUCE_INSTALMENT the count is the promise and the payment is derived, so the
    // last row absorbs the rounding — exactly as the original schedule's last row did.
    // Under REDUCE_TERM the payment is the promise, so the count is whatever it takes.
    rowLimit: request.effect === OverpaymentEffect.REDUCE_INSTALMENT ? remainingCount : undefined,
  });
  const schedule = [...history, ...tail];

  return {
    schedule,
    monthlyPayment: payment,
    termMonths: schedule.length,
    maturesOn: tail.at(-1)?.dueDate ?? firstDueDate,
  };
}

/**
 * Emits rows at a fixed payment until the balance clears.
 *
 * The last row it emits takes whatever principal is left, so the tail reconciles to the
 * outstanding balance exactly, in the same way the original schedule reconciled to the
 * advance. Capped at the contract's maximum term: an instalment too small to cover the
 * interest is caught by the amortisation guard long before this, but a loop over money
 * without a bound is not something to leave in a bank.
 */
function emitRows(input: {
  outstanding: Money;
  aprBps: number;
  firstDueDate: string;
  payment: Money;
  startNumber: number;
  rowLimit?: number;
}): ScheduleRowRecord[] {
  const rate = monthlyRate(input.aprBps);
  const zero = Money.zero(input.outstanding.currency);
  const ceiling = Math.min(input.rowLimit ?? MAX_TERM_MONTHS, MAX_TERM_MONTHS);
  const rows: ScheduleRowRecord[] = [];

  let balance = input.outstanding;
  for (let offset = 0; balance.isPositive && offset < ceiling; offset += 1) {
    const interest = balance.scaleByRatio(rate, RATE_SCALE, RoundingMode.HALF_UP);
    const scheduled = input.payment.minus(interest);
    if (!scheduled.isPositive) {
      throw new RangeError('The instalment no longer covers the interest on this balance.');
    }

    const isFinal = input.rowLimit !== undefined && offset === ceiling - 1;
    const principal = isFinal || scheduled.greaterThan(balance) ? balance : scheduled;
    rows.push(
      row({
        instalment: input.startNumber + offset,
        dueDate: addMonths(input.firstDueDate, offset),
        opening: balance,
        principal,
        interest,
        zero,
      }),
    );
    balance = balance.minus(principal);
  }

  return rows;
}

function row(input: {
  instalment: number;
  dueDate: string;
  opening: Money;
  principal: Money;
  interest: Money;
  zero: Money;
}): ScheduleRowRecord {
  return {
    instalment: input.instalment,
    dueDate: input.dueDate,
    openingBalance: toStored(input.opening),
    payment: toStored(input.principal.plus(input.interest)),
    principal: toStored(input.principal),
    interest: toStored(input.interest),
    fees: toStored(input.zero),
    closingBalance: toStored(input.opening.minus(input.principal)),
    status: 'SCHEDULED',
    paidAmount: toStored(input.zero),
    paidAt: null,
  };
}

/** The month after the last instalment that is already history. */
function nextDueDate(request: RebuildRequest, history: readonly ScheduleRowRecord[]): string {
  const last = history.at(-1);
  return last ? addMonths(last.dueDate, 1) : (request.schedule[0]?.dueDate ?? request.asOf);
}

/** A loan whose balance is gone keeps its history and grows no new instalments. */
function settledResult(
  history: readonly ScheduleRowRecord[],
  request: RebuildRequest,
  firstDueDate: string,
): RebuiltSchedule {
  return {
    schedule: history,
    monthlyPayment: request.monthlyPayment,
    termMonths: history.length,
    maturesOn: history.at(-1)?.dueDate ?? firstDueDate,
  };
}

/**
 * The scheduled principal in instalments that have already fallen due.
 *
 * Compared against what a payment actually put toward principal, this is what tells the
 * servicing path whether a payment was an ordinary instalment or an overpayment — and
 * therefore whether the tail has to be rebuilt at all.
 */
export function maturedPrincipal(input: {
  schedule: readonly ScheduleRowRecord[];
  asOf: string;
  currency: Money['currency'];
}): Money {
  return input.schedule
    .filter((entry) => entry.dueDate <= input.asOf)
    .reduce((total, entry) => total.plus(fromStored(entry.principal)), Money.zero(input.currency));
}
