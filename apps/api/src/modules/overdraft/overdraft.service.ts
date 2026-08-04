/**
 * Requesting a facility, and the bank granting, suspending or withdrawing one.
 *
 * The facility record is the agreement. What makes it *effective* is the `overdraftLimit`
 * written onto the account, because that is the single field `computeAvailability` reads —
 * so an active facility appears in the customer's available balance and a suspended one
 * does not, without either concept being duplicated. Keeping the two in step is the whole
 * job of this service.
 *
 * Which is why every method that changes a facility does so inside one transaction: the
 * facility row and the account's `overdraftLimit` are two writes describing one decision,
 * and a granted facility whose limit never reached the account is a promise the customer
 * cannot spend, while a limit left on an account whose facility was closed is money the
 * bank never agreed to lend.
 */

import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored, fromWire, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountService, AccountStore } from '../accounts/index.js';

import { OverdraftAssessment } from './overdraft-assessment.service.js';
import { ARRANGED_RATE_BPS, OVERDRAFT_TRANSACTION_LABEL } from './overdraft.constants.js';
import { type OverdraftFacility, type RequestOverdraftRequest } from './overdraft.dto.js';
import { toOverdraftFacility } from './overdraft.mapper.js';
import {
  OverdraftStatus,
  OverdraftStore,
  type NewOverdraft,
  type OverdraftRecord,
} from './overdraft.store.js';

const DECLINE_REASON =
  'We are not able to offer an overdraft on this account at the moment. You can ask us ' +
  'for the reasons in writing, free of charge.';

/** A decided request, on its way to the store. */
interface DecidedRequest {
  readonly userId: string;
  readonly accountId: string;
  readonly request: RequestOverdraftRequest;
  readonly granted: Money;
  readonly now: Date;
}

@Injectable()
export class OverdraftService {
  private readonly logger = new Logger(OverdraftService.name);

  constructor(
    private readonly facilities: OverdraftStore,
    private readonly accounts: AccountService,
    private readonly accountStore: AccountStore,
    private readonly assessment: OverdraftAssessment,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Requests a facility and decides it immediately.
   *
   * Decided on the spot because an overdraft is either affordable on the information the
   * bank already holds or it is not; there is nothing an underwriter would add at these
   * amounts, and a customer told to wait three days for a £500 buffer will have found one
   * elsewhere by then.
   *
   * @throws {AppError} `ACCOUNT_NOT_FOUND` or `CONFLICT` when a live facility already
   *   holds the account.
   */
  async request(userId: string, request: RequestOverdraftRequest): Promise<OverdraftFacility> {
    const facility = await this.runner.run((session) => this.decide(userId, request, session), {
      label: OVERDRAFT_TRANSACTION_LABEL.REQUEST,
    });

    return this.render(facility);
  }

  /**
   * The decision and both writes it produces, on one session.
   *
   * The read-then-insert is deliberately *not* the safeguard. Sizing the facility awaits a
   * credit profile, so two requests can both pass {@link assertNoLiveFacility} before
   * either inserts; the store's conditional write is what actually decides the race, and
   * the read is what turns a lost race into a sentence a customer can act on.
   */
  private async decide(
    userId: string,
    request: RequestOverdraftRequest,
    session: ClientSession,
  ): Promise<OverdraftRecord> {
    const account = await this.accounts.requireOwned(
      { userId, accountId: request.accountId },
      session,
    );
    await this.assertNoLiveFacility(account.id, session);

    const granted = await this.assessment.sizeFor(userId, request);
    const decided: DecidedRequest = {
      userId,
      accountId: account.id,
      request,
      granted,
      now: this.assessment.clock.now(),
    };

    const result = await this.facilities.insertIfNoActiveFacility(newFacility(decided), session);
    if (!result.facility) throw facilityAlreadyExists(account.id);

    if (granted.isPositive) await this.applyLimitToAccount(account.id, granted, session);
    this.logger.log(
      `Overdraft ${result.facility.id} ${granted.isPositive ? 'granted' : 'declined'}`,
    );

    return result.facility;
  }

  /** The facility on one of the customer's accounts, priced against its balance today. */
  async forAccount(userId: string, accountId: string): Promise<OverdraftFacility> {
    await this.accounts.requireOwned({ userId, accountId });
    const facility = await this.facilities.findByAccount(accountId);
    if (!facility) throw facilityNotFound(accountId);

    return this.render(facility);
  }

  /** Nominates, or removes, the account the sweep may draw on. */
  async setSweepAccount(input: {
    userId: string;
    accountId: string;
    sweepFromAccountId: string | null;
  }): Promise<OverdraftFacility> {
    const facility = await this.requireOwned(input.userId, input.accountId);
    if (input.sweepFromAccountId) {
      await this.accounts.requireOwned({
        userId: input.userId,
        accountId: input.sweepFromAccountId,
      });
    }

    const updated = await this.facilities.patch(facility.id, {
      sweepFromAccountId: input.sweepFromAccountId,
    });
    return this.render(updated ?? facility);
  }

  /**
   * Withdraws a facility.
   *
   * The limit comes off the account immediately, so nothing further can be drawn, but the
   * balance already drawn stands and continues to accrue. A customer is never pushed into
   * an unarranged position by the bank changing its mind — they simply cannot go deeper.
   */
  async suspend(accountId: string): Promise<OverdraftFacility> {
    const updated = await this.runner.run((session) => this.suspendWithin(accountId, session), {
      label: OVERDRAFT_TRANSACTION_LABEL.SUSPEND,
    });

    this.logger.warn(`Overdraft ${updated.id} suspended on account ${accountId}`);
    return this.render(updated);
  }

  /** The limit removal and the status change, on one session. */
  private async suspendWithin(accountId: string, session: ClientSession): Promise<OverdraftRecord> {
    const facility = await this.requireByAccount(accountId, session);
    const currency = fromStored(facility.limit).currency;

    await this.applyLimitToAccount(accountId, Money.zero(currency), session);
    const updated = await this.facilities.patch(
      facility.id,
      { status: OverdraftStatus.SUSPENDED },
      session,
    );

    return updated ?? facility;
  }

  /**
   * Closes a facility that is no longer drawn.
   *
   * @throws {AppError} `PRECONDITION_FAILED` when there is still a balance on it — closing
   *   a facility that is in use would leave a debt with no agreement behind it.
   */
  async close(userId: string, accountId: string): Promise<OverdraftFacility> {
    const updated = await this.runner.run(
      (session) => this.closeWithin(userId, accountId, session),
      { label: OVERDRAFT_TRANSACTION_LABEL.CLOSE },
    );

    return this.render(updated);
  }

  /** The balance check, the limit removal and the closure, on one session. */
  private async closeWithin(
    userId: string,
    accountId: string,
    session: ClientSession,
  ): Promise<OverdraftRecord> {
    const facility = await this.requireOwned(userId, accountId, session);
    const account = await this.accounts.require(accountId, session);
    const balance = fromStored(account.ledgerBalance);

    if (balance.isNegative) {
      throw new AppError({
        code: ErrorCode.PRECONDITION_FAILED,
        message:
          'Your overdraft is still in use. Bring the account back into credit and we can ' +
          'close the facility straight away.',
        context: { accountId },
      });
    }

    await this.applyLimitToAccount(accountId, Money.zero(balance.currency), session);
    const updated = await this.facilities.patch(
      facility.id,
      {
        status: OverdraftStatus.CLOSED,
        limit: toStored(Money.zero(balance.currency)),
        closedAt: this.assessment.clock.now(),
      },
      session,
    );

    return updated ?? facility;
  }

  /** Resolves the facility on an account the customer holds. */
  async requireOwned(
    userId: string,
    accountId: string,
    session?: ClientSession,
  ): Promise<OverdraftRecord> {
    await this.accounts.requireOwned({ userId, accountId }, session);
    return this.requireByAccount(accountId, session);
  }

  private async requireByAccount(
    accountId: string,
    session?: ClientSession,
  ): Promise<OverdraftRecord> {
    const facility = await this.facilities.findByAccount(accountId, session);
    if (!facility) throw facilityNotFound(accountId);
    return facility;
  }

  /** Writes the limit onto the account, which is what makes it spendable. */
  private async applyLimitToAccount(
    accountId: string,
    limit: Money,
    session?: ClientSession,
  ): Promise<void> {
    await this.accountStore.patch({
      accountId,
      fields: { overdraftLimit: limit },
      ...(session ? { session } : {}),
    });
  }

  private async render(facility: OverdraftRecord): Promise<OverdraftFacility> {
    const account = await this.accounts.require(facility.accountId);
    return toOverdraftFacility({ facility, ledgerBalance: fromStored(account.ledgerBalance) });
  }

  /**
   * @throws {AppError} `CONFLICT` when the account already has a live facility.
   *
   * Covers `SUSPENDED` as well as `ACTIVE`, which the store's conditional insert cannot:
   * a suspended facility is still an agreement, still accruing on whatever is drawn, and
   * granting a second one over the top of it would leave the customer with two.
   */
  private async assertNoLiveFacility(accountId: string, session?: ClientSession): Promise<void> {
    const existing = await this.facilities.findByAccount(accountId, session);
    const live =
      existing?.status === OverdraftStatus.ACTIVE || existing?.status === OverdraftStatus.SUSPENDED;
    if (!live) return;

    throw facilityAlreadyExists(accountId);
  }
}

/** The facility document a decided request produces, granted or declined. */
function newFacility(decided: DecidedRequest): NewOverdraft {
  const approved = decided.granted.isPositive;

  return {
    userId: decided.userId,
    accountId: decided.accountId,
    status: approved ? OverdraftStatus.ACTIVE : OverdraftStatus.DECLINED,
    requestedLimit: toStored(fromWire(decided.request.requestedLimit)),
    limit: toStored(decided.granted),
    aprBps: ARRANGED_RATE_BPS,
    sweepFromAccountId: decided.request.sweepFromAccountId ?? null,
    declineReasons: approved ? [] : [DECLINE_REASON],
    requestedAt: decided.now,
    decidedAt: decided.now,
    closedAt: null,
    lastAccruedOn: null,
    interestChargedToDate: toStored(Money.zero(decided.granted.currency)),
  };
}

/** Raised both by the pre-flight read and by a lost race on the conditional insert. */
function facilityAlreadyExists(accountId: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: 'This account already has an overdraft. Ask us to change the limit instead.',
    context: { accountId },
  });
}

function facilityNotFound(accountId: string): AppError {
  return new AppError({
    code: ErrorCode.OVERDRAFT_NOT_AVAILABLE,
    message: 'There is no overdraft on this account.',
    context: { accountId },
  });
}
