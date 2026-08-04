/**
 * Assembling the profile the scorecard reads.
 *
 * Half of it the customer tells us — income, other commitments, how long they have been in
 * their job — and half of it the bank already knows. The half the bank knows is never
 * taken from the request, however convenient that would be: identity tier and repayment
 * history decide whether money is lent, and a field a client can set is a field an
 * attacker can set.
 */

import { Injectable } from '@nestjs/common';

import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';
import { UsersService } from '../auth/users/index.js';

import { unpaidPortion } from './arrears.js';
import { monthsBetween, toIsoDate } from './calendar.js';
import { type CreditProfile } from './credit-score.js';
import { LoanStore, type LoanRecord } from './loan.store.js';
import { LoanStatus } from './loan.types.js';

/** What the customer declares, and the bank verifies later against documents. */
export interface DeclaredFinances {
  readonly monthlyIncome: Money;
  readonly monthlyDebtPayments: Money;
  readonly employmentMonths: number;
}

/** How far back repayment history counts toward the score. */
const HISTORY_WINDOW_MONTHS = 24;

/** Statuses that mean the customer is still on the hook for a loan. */
const OPEN_STATUSES: ReadonlySet<LoanStatus> = new Set([
  LoanStatus.ACTIVE,
  LoanStatus.IN_ARREARS,
  LoanStatus.RESTRUCTURED,
]);

@Injectable()
export class CreditProfileService {
  constructor(
    private readonly users: UsersService,
    private readonly loans: LoanStore,
    private readonly clock: ClockService,
  ) {}

  /**
   * Builds the profile for a customer.
   *
   * Commitments are the greater of what the customer declared and what their existing
   * Reliance loans actually cost them each month. A customer who forgets to mention a loan
   * they took out here does not thereby become more creditworthy.
   */
  async build(userId: string, declared: DeclaredFinances): Promise<CreditProfile> {
    const user = await this.users.requireById(userId);
    const existing = await this.loans.list({ userId });
    const today = this.clock.today();

    const ownCommitments = this.monthlyCommitments(existing, declared.monthlyIncome.currency);
    const declaredCommitments = declared.monthlyDebtPayments;

    return {
      monthlyIncome: declared.monthlyIncome,
      monthlyDebtPayments: declaredCommitments.greaterThan(ownCommitments)
        ? declaredCommitments
        : ownCommitments,
      employmentMonths: declared.employmentMonths,
      monthsWithBank: monthsBetween(toIsoDate(user.createdAt), today),
      missedPaymentsLast24Months: this.missedPayments(existing, today),
      openLoanCount: existing.filter((loan) => OPEN_STATUSES.has(loan.status)).length,
      kycTier: user.kycTier,
      hasDefaultHistory: existing.some((loan) => loan.status === LoanStatus.WRITTEN_OFF),
    };
  }

  /** What the customer's existing Reliance loans take from them each month. */
  private monthlyCommitments(loans: readonly LoanRecord[], currency: Money['currency']): Money {
    return loans
      .filter((loan) => OPEN_STATUSES.has(loan.status))
      .reduce((total, loan) => total.plus(fromStored(loan.monthlyPayment)), Money.zero(currency));
  }

  /**
   * Instalments missed across every Reliance loan inside the history window.
   *
   * Counted from the instalment table rather than from a stored counter, so a payment made
   * late and then caught up is not held against the customer forever — and so the figure
   * cannot drift away from the schedule it is supposed to describe.
   */
  private missedPayments(loans: readonly LoanRecord[], today: string): number {
    const windowStart = this.windowStart(today);

    return loans
      .flatMap((loan) => loan.schedule)
      .filter((row) => row.dueDate >= windowStart && row.dueDate < today)
      .filter((row) => unpaidPortion(row).isPositive).length;
  }

  private windowStart(today: string): string {
    const start = new Date(`${today}T00:00:00.000Z`);
    start.setUTCMonth(start.getUTCMonth() - HISTORY_WINDOW_MONTHS);
    return toIsoDate(start);
  }
}
