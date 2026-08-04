/**
 * Every ledger movement the lending book makes, in one place.
 *
 * Four services need to post — drawdown, servicing, arrears, collections — and each of
 * them would otherwise carry the `PostingService`, the clock and the reference convention.
 * Concentrating them here means the reference format is defined once (so retries are
 * genuinely idempotent), the value date always comes from the simulated clock, and a
 * reviewer can see the whole of what lending does to the general ledger in one file.
 */

import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { productEntries } from '../../domain/ledger/index.js';
import { PostingService } from '../ledger/posting.service.js';

import { creditEntries } from './credit-entries.js';
import { LoanMovement, loanReference } from './loan-reference.js';

/** What every posting in this file needs to identify itself. */
interface MovementContext {
  readonly loanId: string;
  readonly description: string;
  /** What makes this movement unique on this loan — a business date or instalment number. */
  readonly discriminator: string;
  /**
   * A caller's transaction to book inside.
   *
   * Lending's two multi-step money flows — drawdown and repayment — write a record *and* a
   * ledger entry, and the pair is only meaningful together. Passing the session lets the
   * posting be part of the caller's transaction rather than a separate commit that a later
   * failure cannot take back.
   */
  readonly session?: ClientSession;
}

@Injectable()
export class LoanLedgerService {
  constructor(
    private readonly postings: PostingService,
    private readonly clock: ClockService,
  ) {}

  /** The business date, which is what every value date in lending is stamped with. */
  today(): string {
    return this.clock.today();
  }

  now(): Date {
    return this.clock.now();
  }

  /** Funds the customer and recognises the receivable. */
  async disburse(input: MovementContext & { accountId: string; amount: Money }): Promise<void> {
    await this.postings.post(
      productEntries.loanDisbursement({
        ...this.envelope(input, LoanMovement.DISBURSEMENT),
        accountId: input.accountId,
        amount: input.amount,
      }),
      input.session,
    );
  }

  /** Charges the arrangement fee to the account the advance landed in. */
  async chargeArrangementFee(
    input: MovementContext & { accountId: string; amount: Money },
  ): Promise<void> {
    await this.postings.post(
      productEntries.fee({
        ...this.envelope(input, LoanMovement.ARRANGEMENT_FEE),
        accountId: input.accountId,
        amount: input.amount,
      }),
      input.session,
    );
  }

  /** Collects a repayment, split so principal, interest and fees stay separately visible. */
  async collectRepayment(
    input: MovementContext & {
      accountId: string;
      principal: Money;
      interest: Money;
      fees: Money;
    },
  ): Promise<void> {
    await this.postings.post(
      creditEntries.loanRepayment({
        ...this.envelope(input, LoanMovement.REPAYMENT),
        accountId: input.accountId,
        principal: input.principal,
        interest: input.interest,
        fees: input.fees,
      }),
      input.session,
    );
  }

  /** Charges a late fee to the loan as a receivable, not to the customer's account. */
  async chargeLateFee(input: MovementContext & { amount: Money }): Promise<void> {
    await this.postings.post(
      creditEntries.lateFee({
        ...this.envelope(input, LoanMovement.LATE_FEE),
        amount: input.amount,
      }),
      input.session,
    );
  }

  /**
   * Moves the loss allowance held against a loan.
   *
   * `increase` is the change, not the level: positive recognises more expense, negative
   * releases it when the customer cures. A zero change books nothing at all, which is what
   * makes it safe for the daily sweep to call on every loan it looks at.
   */
  async moveAllowance(input: MovementContext & { increase: Money }): Promise<void> {
    if (input.increase.isZero) return;

    await this.postings.post(
      creditEntries.loanLossAllowance({
        ...this.envelope(input, LoanMovement.ALLOWANCE),
        increase: input.increase,
      }),
      input.session,
    );
  }

  /** Removes the receivable and consumes the allowance held against it. */
  async writeOff(
    input: MovementContext & { outstanding: Money; allowanceHeld: Money },
  ): Promise<void> {
    await this.postings.post(
      creditEntries.loanWriteOff({
        ...this.envelope(input, LoanMovement.WRITE_OFF),
        outstanding: input.outstanding,
        allowanceHeld: input.allowanceHeld,
      }),
      input.session,
    );
  }

  /** The reference, dates and metadata every lending entry carries. */
  private envelope(
    context: MovementContext,
    movement: LoanMovement,
  ): {
    reference: string;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata: Record<string, string>;
  } {
    return {
      reference: loanReference(context.loanId, movement, context.discriminator),
      description: context.description,
      valueDate: this.clock.today(),
      bookedAt: this.clock.now(),
      metadata: { loanId: context.loanId },
    };
  }
}
