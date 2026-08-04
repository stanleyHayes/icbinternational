import { Money } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import { buildSchedule } from '../amortisation.js';
import { toScheduleRow } from '../loan-disbursement.service.js';
import { toQuoteRows } from '../loan.mapper.js';
import { type LoanRecord, type ScheduleRowRecord } from '../loan.store.js';
import { LoanKind, LoanStatus } from '../loan.types.js';

/**
 * A drawn-down loan, built through the same schedule generator production uses.
 *
 * Hand-writing a schedule in a fixture would let the arrears and payoff suites pass
 * against a table the amortisation code would never actually produce. Building it for
 * real means these tests break when the schedule maths breaks, which is the point.
 */

export const FIXTURE_CURRENCY = 'GBP';

/** £12,000 over 24 months at 8.99%, first instalment 15 February 2026. */
export const DEFAULT_LOAN_INPUT = {
  principalMinor: '1200000',
  aprBps: 899,
  termMonths: 24,
  firstPaymentDate: '2026-02-15',
} as const;

/** Builds a loan record, overriding whatever the test cares about. */
export function aLoan(overrides: Partial<LoanRecord> = {}): LoanRecord {
  const principal = Money.fromMinor(DEFAULT_LOAN_INPUT.principalMinor, FIXTURE_CURRENCY);
  const built = buildSchedule({
    principal,
    aprBps: DEFAULT_LOAN_INPUT.aprBps,
    termMonths: DEFAULT_LOAN_INPUT.termMonths,
    firstPaymentDate: DEFAULT_LOAN_INPUT.firstPaymentDate,
  });
  const schedule = toQuoteRows(built).map((row) => toScheduleRow(row));
  const zero = Money.zero(FIXTURE_CURRENCY);

  return {
    id: 'loa_01JQ0000000000000000000001',
    userId: 'usr_01JQ0000000000000000000001',
    applicationId: 'qte_01JQ0000000000000000000001',
    productCode: 'PERSONAL_LOAN',
    productName: 'Reliance Personal Loan',
    kind: LoanKind.PERSONAL,
    status: LoanStatus.ACTIVE,
    disbursementAccountId: 'acc_01JQ0000000000000000000001',
    principal: toStored(principal),
    outstandingPrincipal: toStored(principal),
    interestOutstanding: toStored(zero),
    feesOutstanding: toStored(zero),
    aprBps: DEFAULT_LOAN_INPUT.aprBps,
    termMonths: DEFAULT_LOAN_INPUT.termMonths,
    monthlyPayment: toStored(built.monthlyPayment),
    schedule,
    disbursedAt: new Date('2026-01-15T09:00:00.000Z'),
    maturesOn: schedule.at(-1)?.dueDate ?? DEFAULT_LOAN_INPUT.firstPaymentDate,
    settledAt: null,
    writtenOffAt: null,
    provisionHeld: toStored(zero),
    paymentPlan: null,
    lastArrearsRunOn: null,
    repaymentCount: 0,
    lastRepaymentId: null,
    ...overrides,
  };
}

/** Marks the first `count` instalments paid in full, as a caught-up loan would look. */
export function withInstalmentsPaid(loan: LoanRecord, count: number): LoanRecord {
  const schedule: ScheduleRowRecord[] = loan.schedule.map((row) =>
    row.instalment <= count
      ? {
          ...row,
          status: 'PAID',
          paidAmount: row.payment,
          paidAt: new Date(`${row.dueDate}T10:00:00.000Z`),
        }
      : row,
  );

  const paid = schedule.filter((row) => row.instalment <= count).at(-1);
  return {
    ...loan,
    schedule,
    outstandingPrincipal: paid?.closingBalance ?? loan.outstandingPrincipal,
    repaymentCount: count,
  };
}

/** The instalment table's due dates, for readable assertions. */
export function dueDates(loan: LoanRecord): string[] {
  return loan.schedule.map((row) => row.dueDate);
}
