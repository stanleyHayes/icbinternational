/**
 * Accepting an offer and putting the money in the customer's account.
 *
 * Drawdown is the moment an application becomes an asset on the bank's balance sheet, and
 * it is the one step in lending that must never happen twice.
 *
 * What protects it is the *order*. Validating the offer and then funding it leaves a gap
 * two concurrent acceptances both fit through: both read `OFFER_MADE`, both create a loan,
 * both disburse, and the status patch that was supposed to stop the second runs after the
 * money has already gone. The application is therefore claimed first — an atomic move out
 * of `OFFER_MADE` — and nothing is created or funded unless that claim succeeded. The
 * whole of the rest runs in one transaction, so a failure after the claim takes the loan
 * and the postings with it.
 */

import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, type AmortisationRow, type Loan, type LoanProduct } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored, fromWire, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountService } from '../accounts/index.js';

import { assertOfferAcceptable, patchOrThrow } from './loan-application.rules.js';
import { LoanApplicationStore, type LoanApplicationRecord } from './loan-application.store.js';
import { LoanLedgerService } from './loan-ledger.service.js';
import { findLoanProduct } from './loan-products.catalogue.js';
import { LOAN_TRANSACTION_LABEL } from './loan.constants.js';
import { toContractLoan } from './loan.mapper.js';
import { LoanStore, type LoanRecord, type ScheduleRowRecord } from './loan.store.js';
import { LoanApplicationStatus, LoanStatus } from './loan.types.js';

@Injectable()
export class LoanDisbursementService {
  private readonly logger = new Logger(LoanDisbursementService.name);

  constructor(
    private readonly loans: LoanStore,
    private readonly applications: LoanApplicationStore,
    private readonly accounts: AccountService,
    private readonly ledger: LoanLedgerService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Accepts a live offer and draws it down in one step.
   *
   * There is deliberately no state a customer can be left sitting in between acceptance
   * and funding. `OFFER_ACCEPTED` exists for the width of one transaction as the claim,
   * and either becomes `DISBURSED` with it or is rolled back with it.
   *
   * @throws {AppError} `NOT_FOUND`, `PRECONDITION_FAILED`, `LOAN_NOT_ELIGIBLE`,
   *   `VALIDATION_FAILED` or `CONFLICT`.
   */
  async acceptOffer(userId: string, applicationId: string): Promise<Loan> {
    return this.runner.run((session) => this.drawDown(userId, applicationId, session), {
      label: LOAN_TRANSACTION_LABEL.DRAWDOWN,
    });
  }

  /**
   * The transactional body: validate, claim, create, fund, stamp.
   *
   * Everything before the claim is a read. Everything after it is only reachable by the
   * one caller whose atomic status move succeeded, which is what makes "disburse once" a
   * property of the write rather than of the timing.
   */
  private async drawDown(
    userId: string,
    applicationId: string,
    session: ClientSession,
  ): Promise<Loan> {
    const application = await this.requireOwned(userId, applicationId, session);
    assertOfferAcceptable(application, this.ledger.now());

    const product = this.requireProduct(application.productCode);
    const account = await this.accounts.requireOwned(
      { userId, accountId: application.disbursementAccountId },
      session,
    );
    const advance = fromWire(requireOffer(application).amount);
    assertSameCurrency(advance, account.currency);

    await this.claim(application, session);

    const loan = await this.createLoan({ application, product, advance, session });
    await this.fund({ loan, accountId: account.id, advance, product, session });
    await patchOrThrow(
      this.applications,
      application.id,
      { status: LoanApplicationStatus.DISBURSED, loanId: loan.id },
      session,
    );

    this.logger.log(`Loan ${loan.id} drawn down from application ${application.id}`);
    return toContractLoan(loan, this.ledger.today());
  }

  /**
   * Takes the offer off the table before a penny moves.
   *
   * @throws {AppError} `CONFLICT` when another acceptance of the same offer got there
   *   first. The customer's second click is refused rather than being lent to twice.
   */
  private async claim(application: LoanApplicationRecord, session: ClientSession): Promise<void> {
    const claimed = await this.applications.claim({
      id: application.id,
      from: LoanApplicationStatus.OFFER_MADE,
      fields: {
        status: LoanApplicationStatus.OFFER_ACCEPTED,
        acceptedAt: this.ledger.now(),
      },
      session,
    });

    if (claimed) return;

    throw new AppError({
      code: ErrorCode.CONFLICT,
      message: 'This offer has already been accepted. Your loan is on its way.',
      context: { applicationId: application.id },
    });
  }

  /** Writes the loan and its opening schedule, exactly as the offer quoted them. */
  private async createLoan(input: {
    application: LoanApplicationRecord;
    product: LoanProduct;
    advance: Money;
    session: ClientSession;
  }): Promise<LoanRecord> {
    const offer = requireOffer(input.application);
    const zero = Money.zero(input.advance.currency);
    const schedule = offer.schedule.map((row) => toScheduleRow(row));

    return this.loans.insert(
      {
        userId: input.application.userId,
        applicationId: input.application.id,
        productCode: input.product.code,
        productName: input.product.name,
        kind: input.product.kind,
        status: LoanStatus.ACTIVE,
        disbursementAccountId: input.application.disbursementAccountId,
        principal: toStored(input.advance),
        outstandingPrincipal: toStored(input.advance),
        interestOutstanding: toStored(zero),
        feesOutstanding: toStored(zero),
        aprBps: offer.aprBps,
        termMonths: offer.termMonths,
        monthlyPayment: offer.monthlyPayment,
        schedule,
        disbursedAt: this.ledger.now(),
        maturesOn: schedule.at(-1)?.dueDate ?? offer.firstPaymentDate,
        settledAt: null,
        writtenOffAt: null,
        provisionHeld: toStored(zero),
        paymentPlan: null,
        lastArrearsRunOn: null,
        repaymentCount: 0,
        lastRepaymentId: null,
      },
      input.session,
    );
  }

  /**
   * Books the advance, then the arrangement fee.
   *
   * Two entries rather than one, because they are two events: the customer is funded, and
   * then charged. Netting them would show somebody who borrowed £10,000 receiving £9,900
   * with nothing on the statement to explain the difference.
   */
  private async fund(input: {
    loan: LoanRecord;
    accountId: string;
    advance: Money;
    product: LoanProduct;
    session: ClientSession;
  }): Promise<void> {
    const context = {
      loanId: input.loan.id,
      discriminator: this.ledger.today(),
      session: input.session,
    };

    await this.ledger.disburse({
      ...context,
      description: `${input.product.name} advance`,
      accountId: input.accountId,
      amount: input.advance,
    });

    const fee = fromWire(input.product.arrangementFee);
    if (!fee.isPositive) return;

    await this.ledger.chargeArrangementFee({
      ...context,
      description: `${input.product.name} arrangement fee`,
      accountId: input.accountId,
      amount: fee,
    });
  }

  private async requireOwned(
    userId: string,
    applicationId: string,
    session: ClientSession,
  ): Promise<LoanApplicationRecord> {
    const record = await this.applications.findById(applicationId, session);
    if (record && record.userId === userId) return record;

    throw new AppError({
      code: ErrorCode.NOT_FOUND,
      message: 'We could not find that loan application.',
      context: { applicationId },
    });
  }

  private requireProduct(code: string): LoanProduct {
    const product = findLoanProduct(code);
    if (product) return product;

    throw new AppError({
      code: ErrorCode.NOT_FOUND,
      message: 'That borrowing product is not one we currently offer.',
      context: { productCode: code },
    });
  }
}

/** A quoted instalment as it is first persisted: scheduled, with nothing paid against it. */
export function toScheduleRow(row: AmortisationRow): ScheduleRowRecord {
  return {
    instalment: row.instalment,
    dueDate: row.dueDate,
    openingBalance: row.openingBalance,
    payment: row.payment,
    principal: row.principal,
    interest: row.interest,
    fees: row.fees,
    closingBalance: row.closingBalance,
    status: 'SCHEDULED',
    paidAmount: toStored(Money.zero(fromStored(row.payment).currency)),
    paidAt: null,
  };
}

/**
 * Refuses to advance one currency into an account denominated in another.
 *
 * @throws {AppError} `VALIDATION_FAILED`.
 */
function assertSameCurrency(advance: Money, accountCurrency: string): void {
  if (advance.currency === accountCurrency) return;

  throw new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    message:
      'This loan is in a different currency from the account you asked us to pay it into. ' +
      'Choose an account held in the same currency and we will release the funds.',
    context: { advanceCurrency: advance.currency, accountCurrency },
  });
}

function requireOffer(
  application: LoanApplicationRecord,
): NonNullable<LoanApplicationRecord['offer']> {
  if (application.offer) return application.offer;

  throw new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message: 'There is no live offer on this application to accept.',
    context: { applicationId: application.id },
  });
}
