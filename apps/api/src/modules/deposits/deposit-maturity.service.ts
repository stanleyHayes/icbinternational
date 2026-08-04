/**
 * Maturity: paying a deposit out, or rolling it into a new term.
 *
 * Driven by the business date, so advancing the simulated clock past a maturity date pays
 * the deposit out exactly as a year of real time would.
 *
 * ## Idempotent by construction, atomic by transaction
 *
 * The run only looks at `ACTIVE` deposits and its first act on each is to move it out of
 * that status, so a second pass on the same date finds nothing to do. That only holds if
 * the payout and the status change land together: a deposit that has been paid but is
 * still `ACTIVE` is picked up by the next pass and paid a second time. So each deposit is
 * matured inside one `TransactionRunner` transaction — the release posting, the renewal,
 * the closure and the link between them all commit or none of them do.
 *
 * One transaction per deposit rather than one for the batch: a single unmaturable deposit
 * must not hold up the other four hundred, and a 500-deposit transaction would conflict
 * with every customer touching one of those accounts.
 */

import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { productEntries } from '../../domain/ledger/index.js';
import { PostingService } from '../ledger/posting.service.js';
import { addMonths } from '../loans/index.js';

import { depositEntries } from './deposit-entries.js';
import { interestAtMaturity } from './deposit-interest.js';
import { rateForTenor } from './deposit-rates.js';
import { depositNotFound } from './deposit.service.js';
import { DepositStore, type DepositRecord } from './deposit.store.js';
import {
  DEPOSIT_TRANSACTION_LABEL,
  DepositMovement,
  DepositStatus,
  depositReference,
} from './deposit.types.js';

/** How many deposits one maturity pass will look at. Keeps a run bounded. */
const MATURITY_BATCH_SIZE = 500;

/** One deposit being matured, and the session every write in it must use. */
interface MaturityContext {
  readonly deposit: DepositRecord;
  readonly interest: Money;
  readonly asOf: string;
  readonly session: ClientSession;
}

@Injectable()
export class DepositMaturityService {
  private readonly logger = new Logger(DepositMaturityService.name);

  constructor(
    private readonly deposits: DepositStore,
    private readonly postings: PostingService,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Matures every deposit whose term has ended.
   *
   * @returns How many were matured, which is what the job's metrics record.
   */
  async run(): Promise<number> {
    const asOf = this.clock.today();
    const due = await this.deposits.listMaturing({ asOf, limit: MATURITY_BATCH_SIZE });

    for (const deposit of due) {
      await this.mature(deposit, asOf);
    }

    return due.length;
  }

  /** Matures one deposit, either paying it out or renewing it, in one transaction. */
  async mature(deposit: DepositRecord, asOf: string): Promise<DepositRecord> {
    return this.runner.run((session) => this.matureWithin(deposit.id, asOf, session), {
      label: DEPOSIT_TRANSACTION_LABEL.MATURE,
    });
  }

  /**
   * The transactional body. Re-reads the deposit inside the session.
   *
   * Re-read rather than trusted: the record handed in was loaded before the transaction
   * opened, and `TransactionRunner` re-runs this callback after a write conflict. A
   * deposit another pass has already closed is returned untouched rather than paid again.
   */
  private async matureWithin(
    depositId: string,
    asOf: string,
    session: ClientSession,
  ): Promise<DepositRecord> {
    const deposit = await this.deposits.findById(depositId, session);
    if (!deposit) throw depositNotFound(depositId);
    if (deposit.status !== DepositStatus.ACTIVE) return deposit;

    const interest = interestAtMaturity({
      principal: fromStored(deposit.principal),
      annualRateBps: deposit.annualRateBps,
      placedOn: deposit.placedOn,
      maturesOn: deposit.maturesOn,
    });

    const context: MaturityContext = { deposit, interest, asOf, session };
    return deposit.autoRollover ? this.rollOver(context) : this.payOut(context);
  }

  /**
   * Returns principal and interest to the account the money came from.
   *
   * Back to the source account rather than to a nominated one: the customer chose where
   * the money came from, and returning it anywhere else is a decision the bank has not
   * been asked to make.
   */
  private async payOut(context: MaturityContext): Promise<DepositRecord> {
    const { deposit, interest, asOf, session } = context;

    await this.postings.post(
      depositEntries.depositRelease({
        reference: depositReference(deposit.id, DepositMovement.MATURITY, asOf),
        accountId: deposit.sourceAccountId,
        principal: fromStored(deposit.principal),
        interest,
        description: `${deposit.termMonths}-month fixed rate deposit matured`,
        valueDate: asOf,
        bookedAt: this.clock.now(),
        metadata: { depositId: deposit.id },
      }),
      session,
    );

    this.logger.log(`Deposit ${deposit.id} matured and paid out`);
    return this.close(context, DepositStatus.MATURED);
  }

  /**
   * Renews the principal for another term and pays the interest away.
   *
   * The principal never leaves the term-deposit liability, so no entry moves it: it was
   * always money the bank owed on fixed terms and it still is. Only the interest is a real
   * movement. The new deposit is priced off today's board, not the old rate, because a
   * rollover is a new agreement and pretending otherwise would guarantee a rate the bank
   * has withdrawn.
   */
  private async rollOver(context: MaturityContext): Promise<DepositRecord> {
    const { deposit, interest, asOf, session } = context;

    if (interest.isPositive) {
      await this.postings.post(
        productEntries.interestCredit({
          reference: depositReference(deposit.id, DepositMovement.ROLLOVER, asOf),
          accountId: deposit.sourceAccountId,
          amount: interest,
          description: `${deposit.termMonths}-month fixed rate deposit interest`,
          valueDate: asOf,
          bookedAt: this.clock.now(),
          metadata: { depositId: deposit.id },
        }),
        session,
      );
    }

    const renewed = await this.deposits.insert(
      {
        ...deposit,
        status: DepositStatus.ACTIVE,
        annualRateBps: rateForTenor(deposit.termMonths)?.annualRateBps ?? deposit.annualRateBps,
        placedOn: asOf,
        maturesOn: addMonths(asOf, deposit.termMonths),
        placedAt: this.clock.now(),
        maturedAt: null,
        interestPaid: null,
        rolledIntoId: null,
        rolledFromId: deposit.id,
      },
      session,
    );

    const closed = await this.close(context, DepositStatus.ROLLED_OVER);
    await this.deposits.patch(closed.id, { rolledIntoId: renewed.id }, session);

    this.logger.log(`Deposit ${deposit.id} rolled over into ${renewed.id}`);
    return renewed;
  }

  private async close(context: MaturityContext, status: DepositStatus): Promise<DepositRecord> {
    const updated = await this.deposits.patch(
      context.deposit.id,
      {
        status,
        maturedAt: this.clock.now(),
        interestPaid: toStored(context.interest),
      },
      context.session,
    );

    if (!updated) throw depositNotFound(context.deposit.id);
    return updated;
  }
}
