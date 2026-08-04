/**
 * Settling early, and changing the terms of a loan that is already running.
 *
 * Both are "the rest of this schedule is no longer what will happen". A settlement figure
 * says what it would cost to end it today; a restructure says what it looks like under new
 * terms. They share the arithmetic in `payoff.ts` and `restructure.ts`, and they share the
 * rule that history is never rewritten — only the instalments still to come.
 */

import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode, type Loan, type PayoffQuote } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored, toStored } from '../../common/money/money.codec.js';

import { annuityPayment } from './amortisation.js';
import { LoanLedgerService } from './loan-ledger.service.js';
import { findLoanProduct } from './loan-products.catalogue.js';
import { loanNotFound, LoanServicingService } from './loan-servicing.service.js';
import { PAYOFF_QUOTE_VALIDITY_MINUTES } from './loan.constants.js';
import { toContractLoan, toPayoffQuote } from './loan.mapper.js';
import { LoanStore, type LoanRecord } from './loan.store.js';
import { LoanStatus } from './loan.types.js';
import { type RestructureLoanRequest } from './loans.dto.js';
import { payoffFigures } from './payoff.js';
import { OverpaymentEffect, rebuildTail } from './restructure.js';

const MILLISECONDS_PER_MINUTE = 60_000;

@Injectable()
export class LoanSettlementService {
  private readonly logger = new Logger(LoanSettlementService.name);

  constructor(
    private readonly loans: LoanStore,
    private readonly servicing: LoanServicingService,
    private readonly ledger: LoanLedgerService,
  ) {}

  /**
   * What it costs to clear this loan today.
   *
   * Quoted with an expiry because it is only true today: interest accrues daily, so a
   * figure a customer saved last week and pays this week would leave a small balance
   * behind and a loan the bank cannot close.
   */
  async payoffQuote(userId: string, loanId: string): Promise<PayoffQuote> {
    const loan = await this.servicing.requireOwned(userId, loanId);
    this.assertLive(loan);

    const figures = payoffFigures({
      loan,
      asOf: this.ledger.today(),
      earlyRepaymentFeeBps: this.feeBpsFor(loan),
    });

    return toPayoffQuote({
      loanId: loan.id,
      figures,
      validUntil: new Date(
        this.ledger.now().getTime() + PAYOFF_QUOTE_VALIDITY_MINUTES * MILLISECONDS_PER_MINUTE,
      ),
    });
  }

  /**
   * Changes the remaining term by agreement, and reprices the instalment to match.
   *
   * The rate is held. A restructure is a change to how long the customer has, not an
   * opportunity to reprice risk against somebody who has come to us because they are
   * struggling — repricing at that moment is what turns a difficulty into a default.
   */
  async restructure(loanId: string, request: RestructureLoanRequest): Promise<Loan> {
    const loan = await this.require(loanId);
    this.assertLive(loan);

    const asOf = this.ledger.today();
    const outstanding = fromStored(loan.outstandingPrincipal);
    const rebuilt = rebuildTail({
      schedule: loan.schedule,
      remainingInstalments: request.termMonths,
      outstanding,
      aprBps: loan.aprBps,
      asOf,
      monthlyPayment: annuityPayment({
        principal: outstanding,
        aprBps: loan.aprBps,
        termMonths: request.termMonths,
      }),
      effect: OverpaymentEffect.REDUCE_INSTALMENT,
    });

    const updated = await this.loans.patch(loan.id, {
      schedule: rebuilt.schedule,
      monthlyPayment: toStored(rebuilt.monthlyPayment),
      termMonths: rebuilt.termMonths,
      maturesOn: rebuilt.maturesOn,
      status: LoanStatus.RESTRUCTURED,
    });
    if (!updated) throw loanNotFound(loan.id);

    this.logger.log(`Loan ${loan.id} restructured over ${request.termMonths} months`);
    return toContractLoan(updated, asOf);
  }

  /** The early-repayment charge this product carries, or none if it is off catalogue. */
  private feeBpsFor(loan: LoanRecord): number {
    return findLoanProduct(loan.productCode)?.earlyRepaymentFeeBps ?? 0;
  }

  private async require(loanId: string): Promise<LoanRecord> {
    const loan = await this.loans.findById(loanId);
    if (!loan) throw loanNotFound(loanId);
    return loan;
  }

  /** @throws {AppError} `LOAN_ALREADY_SETTLED` when the loan is closed. */
  private assertLive(loan: LoanRecord): void {
    if (loan.status !== LoanStatus.SETTLED && loan.status !== LoanStatus.WRITTEN_OFF) return;

    throw new AppError({
      code: ErrorCode.LOAN_ALREADY_SETTLED,
      message: 'This loan is closed, so there is nothing left to settle.',
      context: { loanId: loan.id, status: loan.status },
    });
  }
}
