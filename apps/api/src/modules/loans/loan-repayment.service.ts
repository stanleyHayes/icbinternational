/**
 * Collecting a repayment: what it clears, and what it costs the customer's account.
 *
 * Split from {@link LoanServicingService} because collecting money is a different concern
 * from reading a loan, and it is the concern with the concurrency in it. Everything here
 * exists to make one property true — two repayments arriving at the same instant are two
 * repayments, each with its own ledger entry, and the loan falls by exactly their sum.
 *
 * The arithmetic itself is pure and lives elsewhere: {@link applyPayment} decides where the
 * money goes and {@link rebuildTail} decides what the remaining instalments look like
 * afterwards. What is left here is the part that genuinely needs the outside world —
 * ownership, funds, the transaction boundary and the ledger.
 */

import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, type Loan, type RepayLoanRequest } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored, fromWire, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountService, coversSpend, type AccountRecord } from '../accounts/index.js';

import { LoanLedgerService } from './loan-ledger.service.js';
import { LoanServicingService } from './loan-servicing.service.js';
import { LOAN_TRANSACTION_LABEL, MAX_REPAYMENT_ATTEMPTS } from './loan.constants.js';
import { toContractLoan } from './loan.mapper.js';
import { LoanStore, type LoanRecord } from './loan.store.js';
import { LoanStatus } from './loan.types.js';
import { allocatedTotal } from './payment-allocation.js';
import { newRepaymentAttemptId } from './repayment-attempt.js';
import { applyPayment, type RepaymentOutcome } from './repayment.js';
import { OverpaymentEffect, rebuildTail } from './restructure.js';

/** What a repayment needs from the caller. */
export interface RepayInput {
  readonly userId: string;
  readonly loanId: string;
  readonly request: RepayLoanRequest;
}

/**
 * Raised inside the transaction when the loan moved between the read and the write.
 *
 * Not an `AppError`: nothing has gone wrong for the customer and nothing is reported to
 * them. It aborts the transaction — unwinding the claim and, with it, the posting — so the
 * attempt can start again from a fresh read.
 */
class StaleLoanError extends Error {
  constructor(readonly loanId: string) {
    super(`Loan ${loanId} changed while a repayment was being computed`);
    this.name = 'StaleLoanError';
  }
}

/** Statuses a repayment may be taken against. */
const COLLECTABLE: ReadonlySet<LoanStatus> = new Set([
  LoanStatus.ACTIVE,
  LoanStatus.IN_ARREARS,
  LoanStatus.RESTRUCTURED,
]);

@Injectable()
export class LoanRepaymentService {
  constructor(
    private readonly loans: LoanStore,
    private readonly accounts: AccountService,
    private readonly ledger: LoanLedgerService,
    private readonly servicing: LoanServicingService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Takes a repayment from a nominated account.
   *
   * Only what is actually owed is collected. A customer who types a figure larger than
   * their settlement amount is debited the settlement amount and no more — taking the rest
   * would leave the bank holding money against a loan that no longer exists.
   *
   * The attempt id is minted here, once, and not inside the transaction. That is what
   * makes it an idempotency key rather than a nonce: every re-run of this collection
   * carries the same id, so the ledger recognises a replayed posting and the loan
   * recognises a write-down it has already taken.
   *
   * @throws {AppError} `LOAN_NOT_FOUND`, `LOAN_ALREADY_SETTLED`, `ACCOUNT_NOT_FOUND`,
   *   `VALIDATION_FAILED`, `INSUFFICIENT_FUNDS` or `CONFLICT`.
   */
  async repay(input: RepayInput): Promise<Loan> {
    const attemptId = newRepaymentAttemptId();

    for (let attempt = 1; attempt <= MAX_REPAYMENT_ATTEMPTS; attempt += 1) {
      const collected = await this.attemptCollection(input, attemptId);
      if (collected) return collected;
    }

    throw loanBusy(input.loanId);
  }

  /**
   * One attempt at the whole collection, in one transaction.
   *
   * Null means another repayment committed between this attempt's read and its write, so
   * the figures were computed against a balance that no longer exists and the attempt has
   * to start again. Everything the attempt did is gone with the aborted transaction.
   */
  private async attemptCollection(input: RepayInput, attemptId: string): Promise<Loan | null> {
    try {
      return await this.runner.run((session) => this.collect(input, attemptId, session), {
        label: LOAN_TRANSACTION_LABEL.REPAY,
      });
    } catch (error) {
      if (error instanceof StaleLoanError) return null;
      throw error;
    }
  }

  /**
   * The transactional body: read, decide, claim, post.
   *
   * The order is the fix. Claiming the loan — a conditional write naming the
   * `repaymentCount` the figures were derived from — happens *before* the money moves, so
   * a stale attempt is refused having posted nothing. Posting first and writing after
   * would leave the losing attempt's ledger movement to be unwound, and would depend on
   * the unwind for correctness.
   */
  private async collect(
    input: RepayInput,
    attemptId: string,
    session: ClientSession,
  ): Promise<Loan> {
    const loan = await this.servicing.requireOwned(input.userId, input.loanId, session);
    const asOf = this.ledger.today();
    // Our own id already on the loan means this attempt committed and only its
    // acknowledgement was lost. Collecting again would debit the customer twice.
    if (loan.lastRepaymentId === attemptId) return toContractLoan(loan, asOf);

    this.assertCollectable(loan);
    const account = await this.accounts.requireOwned(
      { userId: input.userId, accountId: input.request.fromAccountId },
      session,
    );
    const payment = fromWire(input.request.amount);
    this.assertSameCurrency(loan, payment);

    const outcome = applyPayment({ loan, payment, asOf, paidAt: this.ledger.now() });
    const collected = allocatedTotal(outcome.allocation);
    if (!collected.isPositive) return toContractLoan(loan, asOf);
    assertFundsAvailable(account, collected);

    const effect = overpaymentEffect(input.request);
    const claimed = await this.claim({ loan, outcome, asOf, attemptId, effect, session });
    await this.bookRepayment({ loan, outcome, accountId: account.id, attemptId, session });
    return toContractLoan(claimed, asOf);
  }

  /**
   * Writes the loan's new position — but only if it is still the position it was computed
   * from.
   *
   * `patchIf` names the `repaymentCount` that was read, so a concurrent repayment that
   * committed in the meantime turns this into a refusal rather than a write that silently
   * overwrites theirs. That is the difference between a loan that fell by two payments and
   * a loan that fell by whichever payment happened to write last.
   *
   * The schedule rebuild is conditional for an unrelated reason: most payments are ordinary
   * instalments, and regenerating an unchanged schedule on every one of them would rewrite
   * the customer's future dates for nothing.
   */
  private async claim(input: {
    loan: LoanRecord;
    outcome: RepaymentOutcome;
    asOf: string;
    attemptId: string;
    effect: OverpaymentEffect;
    session: ClientSession;
  }): Promise<LoanRecord> {
    const { loan, outcome, asOf } = input;
    const rebuilt = this.overpaid(loan, outcome, asOf)
      ? rebuildTail({
          schedule: outcome.schedule,
          outstanding: outcome.outstandingPrincipal,
          aprBps: loan.aprBps,
          asOf,
          monthlyPayment: fromStored(loan.monthlyPayment),
          effect: input.effect,
        })
      : null;

    const updated = await this.loans.patchIf({
      id: loan.id,
      expect: { repaymentCount: loan.repaymentCount },
      session: input.session,
      fields: {
        schedule: rebuilt?.schedule ?? outcome.schedule,
        monthlyPayment: rebuilt ? toStored(rebuilt.monthlyPayment) : undefined,
        termMonths: rebuilt?.termMonths,
        maturesOn: rebuilt?.maturesOn,
        outstandingPrincipal: toStored(outcome.outstandingPrincipal),
        interestOutstanding: toStored(outcome.interestOutstanding),
        feesOutstanding: toStored(outcome.feesOutstanding),
        repaymentCount: loan.repaymentCount + 1,
        lastRepaymentId: input.attemptId,
        status: outcome.settled ? LoanStatus.SETTLED : this.statusAfter(loan, outcome, asOf),
        settledAt: outcome.settled ? this.ledger.now() : null,
      },
    });

    if (!updated) throw new StaleLoanError(loan.id);
    return updated;
  }

  /**
   * Books the movement the claim has already been written against.
   *
   * The attempt id is in the reference, which is what makes two repayments of different
   * amounts two entries. Deriving it from the date and the repayment counter — both of
   * which concurrent callers read identically — is what let the ledger treat the second
   * as a replay of the first and book nothing at all.
   */
  private async bookRepayment(input: {
    loan: LoanRecord;
    outcome: RepaymentOutcome;
    accountId: string;
    attemptId: string;
    session: ClientSession;
  }): Promise<void> {
    const { allocation } = input.outcome;

    await this.ledger.collectRepayment({
      loanId: input.loan.id,
      description: `${input.loan.productName} repayment`,
      discriminator: input.attemptId,
      accountId: input.accountId,
      principal: allocation.toPrincipal,
      interest: allocation.toInterest,
      fees: allocation.toFees,
      session: input.session,
    });
  }

  /**
   * Whether the payment reduced principal further than the schedule expected by now.
   *
   * The schedule's own closing balance at the last matured instalment is the yardstick: if
   * the customer is below it, they have paid ahead and the remaining rows no longer
   * describe the debt.
   */
  private overpaid(loan: LoanRecord, outcome: RepaymentOutcome, asOf: string): boolean {
    if (!outcome.outstandingPrincipal.isPositive) return false;

    const matured = loan.schedule.filter((row) => row.dueDate <= asOf).at(-1);
    const expected = matured ? fromStored(matured.closingBalance) : fromStored(loan.principal);
    return outcome.outstandingPrincipal.lessThan(expected);
  }

  /** A loan that has cleared its arrears goes back to `ACTIVE`; one that has not, stays. */
  private statusAfter(loan: LoanRecord, outcome: RepaymentOutcome, asOf: string): LoanStatus {
    if (loan.status !== LoanStatus.IN_ARREARS) return loan.status;

    const stillBehind = outcome.schedule.some(
      (row) => row.dueDate <= asOf && row.status !== 'PAID' && row.status !== 'WAIVED',
    );
    return stillBehind ? LoanStatus.IN_ARREARS : LoanStatus.ACTIVE;
  }

  /** @throws {AppError} `LOAN_ALREADY_SETTLED` when there is nothing left to collect. */
  private assertCollectable(loan: LoanRecord): void {
    if (COLLECTABLE.has(loan.status)) return;

    throw new AppError({
      code: ErrorCode.LOAN_ALREADY_SETTLED,
      message: 'This loan is closed, so there is nothing left to pay.',
      context: { loanId: loan.id, status: loan.status },
    });
  }

  private assertSameCurrency(loan: LoanRecord, payment: Money): void {
    const expected = fromStored(loan.principal).currency;
    if (payment.currency === expected) return;

    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: `This loan is repaid in ${expected}. Choose an account held in ${expected}.`,
      context: { loanId: loan.id, expected, supplied: payment.currency },
    });
  }
}

/** The contract's default is to shorten the term, which is the cheaper choice. */
function overpaymentEffect(request: RepayLoanRequest): OverpaymentEffect {
  return request.overpaymentEffect === OverpaymentEffect.REDUCE_INSTALMENT
    ? OverpaymentEffect.REDUCE_INSTALMENT
    : OverpaymentEffect.REDUCE_TERM;
}

/**
 * Refuses a collection the nominated account cannot cover.
 *
 * The ledger holds the same floor and will refuse the posting itself, so this is not the
 * guarantee — the balance can move between this check and the debit, which is why the
 * floor stays. What it buys is the customer's experience: a reason, before anything is
 * claimed, instead of a transaction that opens, claims the loan and then unwinds.
 *
 * @throws {AppError} `INSUFFICIENT_FUNDS`.
 */
function assertFundsAvailable(account: AccountRecord, amount: Money): void {
  if (coversSpend(account, amount)) return;

  throw new AppError({
    code: ErrorCode.INSUFFICIENT_FUNDS,
    message:
      'There is not enough available in that account to cover this repayment. ' +
      'Choose another account or pay a smaller amount.',
    context: { accountId: account.id },
  });
}

/**
 * Reported when a loan is under so much concurrent pressure that no attempt could commit.
 *
 * Every retry lost a race, which on one loan means something is repaying it in a loop.
 * Answering rather than spinning keeps the request bounded.
 */
function loanBusy(loanId: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: 'Another payment to this loan is still being processed. Please try again in a moment.',
    context: { loanId },
  });
}
