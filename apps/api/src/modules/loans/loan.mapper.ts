/**
 * Turning stored lending records into the shapes the contract publishes.
 *
 * Everything a customer reads about a loan — the next payment, how many instalments are
 * left, whether they are behind — is derived here rather than stored, because a derived
 * figure that is also persisted is a figure that can disagree with itself. The only
 * numbers on the record are the ones that cannot be recomputed: what was advanced, what is
 * outstanding, and what has actually been paid.
 */

import {
  type AmortisationRow,
  type Loan,
  type LoanQuote,
  type PayoffQuote,
} from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { fromStored, toWire, type StoredMoney } from '../../common/money/money.codec.js';

import { type AmortisationSchedule } from './amortisation.js';
import { arrearsAmount, daysPastDue } from './arrears.js';
import { type LoanRecord, type ScheduleRowRecord } from './loan.store.js';
import { type PayoffFigures } from './payoff.js';
import { isSettled } from './repayment.js';

/**
 * A stored instalment as the contract renders it.
 *
 * Storage and wire hold the same three characters of currency code, but only the wire type
 * narrows it to a known currency. Round-tripping through `Money` is what turns the stored
 * string into that narrower type, and it validates the code on the way through — a
 * corrupt currency on a persisted row is caught here rather than in a client.
 */
export function toContractRow(row: ScheduleRowRecord): AmortisationRow {
  return {
    instalment: row.instalment,
    dueDate: row.dueDate,
    openingBalance: wire(row.openingBalance),
    payment: wire(row.payment),
    principal: wire(row.principal),
    interest: wire(row.interest),
    fees: wire(row.fees),
    closingBalance: wire(row.closingBalance),
    status: row.status,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  };
}

/** Re-reads a stored amount so its currency is the contract's narrowed union. */
function wire(stored: StoredMoney): ReturnType<typeof toWire> {
  return toWire(fromStored(stored));
}

/** A freshly computed schedule as the contract renders it, before anything is paid. */
export function toQuoteRows(schedule: AmortisationSchedule): AmortisationRow[] {
  return schedule.rows.map((row) => ({
    instalment: row.instalment,
    dueDate: row.dueDate,
    openingBalance: toWire(row.openingBalance),
    payment: toWire(row.payment),
    principal: toWire(row.principal),
    interest: toWire(row.interest),
    fees: toWire(row.fees),
    closingBalance: toWire(row.closingBalance),
    status: 'SCHEDULED' as const,
    paidAt: null,
  }));
}

/** An illustrative quote: what this amount over this term at this rate would cost. */
export function toLoanQuote(input: {
  productCode: string;
  amount: Money;
  termMonths: number;
  aprBps: number;
  arrangementFee: Money;
  firstPaymentDate: string;
  schedule: AmortisationSchedule;
}): LoanQuote {
  return {
    productCode: input.productCode,
    amount: toWire(input.amount),
    termMonths: input.termMonths,
    aprBps: input.aprBps,
    monthlyPayment: toWire(input.schedule.monthlyPayment),
    totalRepayable: toWire(input.schedule.totalRepayable.plus(input.arrangementFee)),
    totalInterest: toWire(input.schedule.totalInterest),
    arrangementFee: toWire(input.arrangementFee),
    firstPaymentDate: input.firstPaymentDate,
    schedule: toQuoteRows(input.schedule),
  };
}

/**
 * A loan as the customer's dashboard shows it.
 *
 * `nextPaymentDate` is the first instalment that still owes something, which is not the
 * same as the first instalment in the future: a customer in arrears is shown the payment
 * they missed, because that is the one they need to make.
 */
export function toContractLoan(loan: LoanRecord, asOf: string): Loan {
  const currency = fromStored(loan.principal).currency;
  const next = loan.schedule.find((row) => !isSettled(row));
  const paid = loan.schedule.filter((row) => isSettled(row)).length;

  return {
    id: loan.id,
    applicationId: loan.applicationId,
    productCode: loan.productCode,
    productName: loan.productName,
    kind: loan.kind,
    status: loan.status,
    principal: wire(loan.principal),
    outstandingBalance: wire(loan.outstandingPrincipal),
    aprBps: loan.aprBps,
    termMonths: loan.termMonths,
    monthlyPayment: wire(loan.monthlyPayment),
    nextPaymentDate: next?.dueDate ?? null,
    nextPaymentAmount: next ? wire(next.payment) : null,
    instalmentsPaid: paid,
    instalmentsRemaining: loan.schedule.length - paid,
    arrearsAmount: toWire(arrearsAmount(loan.schedule, asOf, currency)),
    daysPastDue: daysPastDue(loan.schedule, asOf),
    disbursedAt: loan.disbursedAt.toISOString(),
    maturesOn: loan.maturesOn,
    settledAt: loan.settledAt ? loan.settledAt.toISOString() : null,
  };
}

/** A settlement figure as the contract publishes it. */
export function toPayoffQuote(input: {
  loanId: string;
  figures: PayoffFigures;
  validUntil: Date;
}): PayoffQuote {
  return {
    loanId: input.loanId,
    outstandingPrincipal: toWire(input.figures.outstandingPrincipal),
    accruedInterest: toWire(input.figures.accruedInterest),
    earlyRepaymentFee: toWire(input.figures.earlyRepaymentFee),
    interestRebate: toWire(input.figures.interestRebate),
    totalPayable: toWire(input.figures.totalPayable),
    validUntil: input.validUntil.toISOString(),
  };
}
