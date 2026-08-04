/**
 * Placing a term deposit, reading it, and breaking it early.
 *
 * The rate is fixed at placement from the board in force that day and stored on the
 * deposit. Reading it back off the live board would silently reprice every existing
 * deposit whenever the board moved, which is precisely the thing a fixed-term product
 * promises not to do.
 *
 * ## Every movement is one transaction
 *
 * A deposit record and the posting that funds it are two writes describing one event, and
 * an ACTIVE deposit that was never funded is money: the maturity run pays it out *with
 * interest* to an account that never gave the principal up. So both writes go through
 * `TransactionRunner` on one session and either both land or neither does.
 *
 * That makes every callback here re-runnable, which is the runner's contract: each one
 * reads inside its session, writes nothing outside it, and holds no state that outlives
 * the transaction.
 */

import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  ErrorCode,
  type CreateDepositRequest,
  type Deposit,
  type DepositRate,
} from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromStored, fromWire, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { productEntries } from '../../domain/ledger/index.js';
import { AccountService } from '../accounts/index.js';
import { BalanceService } from '../holds/index.js';
import { PostingService } from '../ledger/posting.service.js';
import { addMonths } from '../loans/index.js';

import { depositEntries } from './deposit-entries.js';
import { breakFigures, type BreakFigures } from './deposit-interest.js';
import { DEPOSIT_RATES, brokenRateBps, rateForTenor } from './deposit-rates.js';
import { toBreakQuote, toContractDeposit } from './deposit.mapper.js';
import { DepositStore, type DepositRecord, type NewDeposit } from './deposit.store.js';
import {
  DEPOSIT_TRANSACTION_LABEL,
  DepositMovement,
  DepositStatus,
  depositReference,
  type BreakDepositQuote,
} from './deposit.types.js';

/** What a placement needs once the board and the amount have been settled. */
interface PlacementInput {
  readonly userId: string;
  readonly request: CreateDepositRequest;
  readonly board: DepositRate;
  readonly amount: Money;
  readonly session: ClientSession;
}

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private readonly deposits: DepositStore,
    private readonly accounts: AccountService,
    private readonly balances: BalanceService,
    private readonly postings: PostingService,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /** The rate board, exactly as the savings pages publish it. */
  rates(): readonly DepositRate[] {
    return DEPOSIT_RATES;
  }

  /** The customer's deposits, newest placement first. */
  async list(userId: string): Promise<Deposit[]> {
    const records = await this.deposits.list({ userId });
    const asOf = this.clock.today();
    return records.map((record) => toContractDeposit(record, asOf));
  }

  /** One deposit, resolved through the customer's id. */
  async get(userId: string, depositId: string): Promise<Deposit> {
    return toContractDeposit(await this.requireOwned(userId, depositId), this.clock.today());
  }

  /**
   * Places a deposit, moving the money out of the customer's account the same instant.
   *
   * There is no pending state. Money the customer can still spend is not on deposit, and a
   * deposit that has not been funded is a promise the bank is paying interest on — so the
   * record and the posting share one transaction and neither survives the other failing.
   *
   * @throws {AppError} `VALIDATION_FAILED`, `ACCOUNT_NOT_FOUND`, `ACCOUNT_FROZEN`,
   *   `CURRENCY_MISMATCH` or `INSUFFICIENT_FUNDS`.
   */
  async place(userId: string, request: CreateDepositRequest): Promise<Deposit> {
    const board = this.requireRate(request.termMonths);
    const amount = fromWire(request.amount);
    this.assertPlaceable(amount, fromWire(board.minAmount));

    const deposit = await this.runner.run(
      (session) => this.placeWithin({ userId, request, board, amount, session }),
      { label: DEPOSIT_TRANSACTION_LABEL.PLACE },
    );

    this.logger.log(`Deposit ${deposit.id} placed over ${request.termMonths} months`);
    return toContractDeposit(deposit, deposit.placedOn);
  }

  /** What breaking this deposit today would produce. Costs nothing to ask. */
  async breakQuote(userId: string, depositId: string): Promise<BreakDepositQuote> {
    const deposit = await this.requireOwned(userId, depositId);
    assertActive(deposit);
    return toBreakQuote(deposit, this.clock.today());
  }

  /**
   * Breaks a deposit and returns the money with the recalculated interest.
   *
   * The customer always gets at least their principal back. The penalty is applied by
   * recalculating the elapsed period at a reduced rate rather than by deducting a charge,
   * so it can never eat into capital.
   *
   * The release posting and the status change commit together: a deposit that has been
   * paid out but is still `ACTIVE` would be picked up by the maturity run and paid twice.
   */
  async breakEarly(userId: string, depositId: string): Promise<Deposit> {
    const asOf = this.clock.today();
    const updated = await this.runner.run(
      (session) => this.breakWithin(userId, depositId, asOf, session),
      { label: DEPOSIT_TRANSACTION_LABEL.BREAK },
    );

    this.logger.log(`Deposit ${updated.id} broken early`);
    return toContractDeposit(updated, asOf);
  }

  /** Turns automatic renewal on or off before maturity. */
  async setAutoRollover(input: {
    userId: string;
    depositId: string;
    autoRollover: boolean;
  }): Promise<Deposit> {
    const deposit = await this.requireOwned(input.userId, input.depositId);
    assertActive(deposit);

    const updated = await this.deposits.patch(deposit.id, {
      autoRollover: input.autoRollover,
    });
    return toContractDeposit(updated ?? deposit, this.clock.today());
  }

  /**
   * Resolves a deposit the customer holds.
   *
   * @throws {AppError} `NOT_FOUND` whether the deposit is missing or somebody else's.
   */
  async requireOwned(
    userId: string,
    depositId: string,
    session?: ClientSession,
  ): Promise<DepositRecord> {
    const deposit = await this.deposits.findById(depositId, session);
    if (!deposit || deposit.userId !== userId) throw depositNotFound(depositId);
    return deposit;
  }

  /**
   * The record and the posting, on one session.
   *
   * The funds check is a pre-flight, not the enforcement: `MongoAccountBalancePort` refuses
   * any posting that would breach the account's facility. Asking first is what turns "the
   * transaction aborted" into a sentence naming what is actually available.
   */
  private async placeWithin(input: PlacementInput): Promise<DepositRecord> {
    const { amount, request, session } = input;
    const account = await this.accounts.requireOwned(
      { userId: input.userId, accountId: request.sourceAccountId },
      session,
    );
    await this.balances.assertSufficientFunds(account.id, amount, session);

    const placedOn = this.clock.today();
    const deposit = await this.deposits.insert(
      newDeposit({ input, accountId: account.id, placedOn, placedAt: this.clock.now() }),
      session,
    );

    await this.postings.post(
      productEntries.depositPlacement({
        reference: depositReference(deposit.id, DepositMovement.PLACEMENT, placedOn),
        accountId: account.id,
        amount,
        description: `${request.termMonths}-month fixed rate deposit`,
        valueDate: placedOn,
        bookedAt: this.clock.now(),
        metadata: { depositId: deposit.id },
      }),
      session,
    );

    return deposit;
  }

  /** The release posting and the closure, on one session. */
  private async breakWithin(
    userId: string,
    depositId: string,
    asOf: string,
    session: ClientSession,
  ): Promise<DepositRecord> {
    const deposit = await this.requireOwned(userId, depositId, session);
    assertActive(deposit);

    const figures = brokenFigures(deposit, asOf);
    const interest = figures.netProceeds.minus(figures.principal);

    await this.postings.post(
      depositEntries.depositRelease({
        reference: depositReference(deposit.id, DepositMovement.BREAK, asOf),
        accountId: deposit.sourceAccountId,
        principal: figures.principal,
        interest,
        description: 'Fixed rate deposit closed early',
        valueDate: asOf,
        bookedAt: this.clock.now(),
        metadata: { depositId: deposit.id },
      }),
      session,
    );

    const updated = await this.deposits.patch(
      deposit.id,
      {
        status: DepositStatus.BROKEN,
        brokenAt: this.clock.now(),
        interestPaid: toStored(interest),
        autoRollover: false,
      },
      session,
    );

    if (!updated) throw depositNotFound(deposit.id);
    return updated;
  }

  /** @throws {AppError} `VALIDATION_FAILED` when that tenor is not on the board. */
  private requireRate(termMonths: number): DepositRate {
    const board = rateForTenor(termMonths);
    if (board) return board;

    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'We do not currently offer a fixed rate deposit over that term.',
      context: { termMonths },
    });
  }

  /** @throws {AppError} `VALIDATION_FAILED` when the placement is below the minimum. */
  private assertPlaceable(amount: Money, minimum: Money): void {
    if (amount.greaterThanOrEqual(minimum)) return;

    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: `The smallest fixed rate deposit we accept is ${minimum.format()}.`,
    });
  }
}

/**
 * The deposit document a placement produces.
 *
 * Every date on it is passed in rather than read from the clock here, so the record, its
 * maturity date and the ledger reference that pins them together all agree on one business
 * date — even if the transaction is retried across midnight.
 */
function newDeposit(input: {
  input: PlacementInput;
  accountId: string;
  placedOn: string;
  placedAt: Date;
}): NewDeposit {
  const { amount, board, request, userId } = input.input;

  return {
    userId,
    status: DepositStatus.ACTIVE,
    sourceAccountId: input.accountId,
    principal: toStored(amount),
    annualRateBps: board.annualRateBps,
    termMonths: request.termMonths,
    autoRollover: request.autoRollover,
    placedOn: input.placedOn,
    maturesOn: addMonths(input.placedOn, request.termMonths),
    placedAt: input.placedAt,
    maturedAt: null,
    brokenAt: null,
    interestPaid: null,
    rolledIntoId: null,
    rolledFromId: null,
  };
}

/** What breaking this deposit today produces, at the reduced rate. */
function brokenFigures(deposit: DepositRecord, asOf: string): BreakFigures {
  return breakFigures({
    principal: fromStored(deposit.principal),
    annualRateBps: deposit.annualRateBps,
    reducedRateBps: brokenRateBps(deposit.annualRateBps),
    placedOn: deposit.placedOn,
    asOf,
  });
}

/** @throws {AppError} `DEPOSIT_ALREADY_BROKEN` when the term is already over. */
export function assertActive(deposit: DepositRecord): void {
  if (deposit.status === DepositStatus.ACTIVE) return;

  throw new AppError({
    code: ErrorCode.DEPOSIT_ALREADY_BROKEN,
    message: 'This deposit has already been closed.',
    context: { depositId: deposit.id, status: deposit.status },
  });
}

/** @throws {AppError} `NOT_FOUND` for a deposit that is missing or somebody else's. */
export function depositNotFound(depositId: string): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: 'We could not find that deposit.',
    context: { depositId },
  });
}
