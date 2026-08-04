/**
 * Collections: arrangements to catch up, and the point where the bank gives up.
 *
 * A payment plan is forbearance — the bank agreeing to take less for a while so a customer
 * in difficulty is not driven into default. A write-off is the opposite end of the same
 * road. Both are recorded explicitly against a named reason, never as a bare status
 * change, because both are decisions somebody has to be able to justify later.
 */

import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode, type Loan } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored, fromWire, toStored } from '../../common/money/money.codec.js';

import { positionOf } from './loan-arrears.service.js';
import { LoanLedgerService } from './loan-ledger.service.js';
import { loanNotFound } from './loan-servicing.service.js';
import { DEFAULT_THRESHOLD_DAYS } from './loan.constants.js';
import { toContractLoan } from './loan.mapper.js';
import { LoanStore, type LoanRecord } from './loan.store.js';
import { LoanStatus, PaymentPlanStatus } from './loan.types.js';
import { type PaymentPlanRequest, type WriteOffRequest } from './loans.dto.js';

@Injectable()
export class LoanCollectionsService {
  private readonly logger = new Logger(LoanCollectionsService.name);

  constructor(
    private readonly loans: LoanStore,
    private readonly ledger: LoanLedgerService,
  ) {}

  /**
   * Records an arrangement to clear arrears in instalments.
   *
   * The plan sits alongside the contractual schedule rather than replacing it. The
   * customer still owes what they owe; what the plan changes is what the bank will accept
   * without escalating, and keeping the two separate is what lets a broken arrangement be
   * seen for what it is.
   */
  async agreePaymentPlan(loanId: string, request: PaymentPlanRequest): Promise<Loan> {
    const loan = await this.require(loanId);
    this.assertCollectable(loan);

    const instalment = fromWire(request.instalmentAmount);
    const arrears = positionOf(loan, this.ledger.today()).arrearsAmount;
    this.assertPlanClearsArrears(instalment, request.instalments, arrears);

    const updated = await this.loans.patch(loan.id, {
      paymentPlan: {
        instalmentAmount: toStored(instalment),
        instalments: request.instalments,
        startsOn: request.startsOn,
        status: PaymentPlanStatus.ACTIVE,
        agreedAt: this.ledger.now(),
      },
    });
    if (!updated) throw loanNotFound(loan.id);

    this.logger.log(`Payment plan agreed on loan ${loan.id} over ${request.instalments} months`);
    return toContractLoan(updated, this.ledger.today());
  }

  /**
   * Writes the balance off.
   *
   * The debt is not forgiven — the customer still owes it and the bank may still pursue it
   * — but it stops being carried as an asset. Only a loan ninety days down can be written
   * off, so this cannot be used to quietly clear a balance that is merely inconvenient.
   */
  async writeOff(loanId: string, request: WriteOffRequest): Promise<Loan> {
    const loan = await this.require(loanId);
    const asOf = this.ledger.today();
    this.assertWriteOffAllowed(loan, asOf);

    const outstanding = fromStored(loan.outstandingPrincipal);
    await this.ledger.writeOff({
      loanId: loan.id,
      description: `Write-off — ${request.reason}`,
      discriminator: asOf,
      outstanding,
      allowanceHeld: fromStored(loan.provisionHeld),
    });

    const updated = await this.loans.patch(loan.id, {
      status: LoanStatus.WRITTEN_OFF,
      writtenOffAt: this.ledger.now(),
      outstandingPrincipal: toStored(outstanding.minus(outstanding)),
      provisionHeld: toStored(outstanding.minus(outstanding)),
    });
    if (!updated) throw loanNotFound(loan.id);

    this.logger.warn(`Loan ${loan.id} written off: ${request.reason}`);
    return toContractLoan(updated, asOf);
  }

  private async require(loanId: string): Promise<LoanRecord> {
    const loan = await this.loans.findById(loanId);
    if (!loan) throw loanNotFound(loanId);
    return loan;
  }

  /** @throws {AppError} `LOAN_ALREADY_SETTLED` when the loan is already closed. */
  private assertCollectable(loan: LoanRecord): void {
    if (loan.status !== LoanStatus.SETTLED && loan.status !== LoanStatus.WRITTEN_OFF) return;

    throw new AppError({
      code: ErrorCode.LOAN_ALREADY_SETTLED,
      message: 'This loan is closed, so there is nothing to arrange.',
      context: { loanId: loan.id, status: loan.status },
    });
  }

  /**
   * Refuses a plan that would never clear what is owed.
   *
   * An arrangement the customer cannot finish is worse than no arrangement: it stops the
   * clock on escalation while the arrears keep growing underneath it.
   *
   * @throws {AppError} `VALIDATION_FAILED`.
   */
  private assertPlanClearsArrears(
    instalment: ReturnType<typeof fromWire>,
    instalments: number,
    arrears: ReturnType<typeof fromWire>,
  ): void {
    if (instalment.times(instalments).greaterThanOrEqual(arrears)) return;

    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message:
        `An arrangement of this size would not clear the ${arrears.format()} outstanding. ` +
        'Increase the amount or the number of payments.',
    });
  }

  /**
   * @throws {AppError} `PRECONDITION_FAILED` when the loan is not far enough down, or is
   *   already closed.
   */
  private assertWriteOffAllowed(loan: LoanRecord, asOf: string): void {
    this.assertCollectable(loan);

    if (positionOf(loan, asOf).daysPastDue >= DEFAULT_THRESHOLD_DAYS) return;

    throw new AppError({
      code: ErrorCode.PRECONDITION_FAILED,
      message:
        `A loan is written off only once it is ${DEFAULT_THRESHOLD_DAYS} days past due. ` +
        'Agree a payment plan or continue collections first.',
      context: { loanId: loan.id },
    });
  }
}
