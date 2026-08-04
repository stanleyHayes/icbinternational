import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  AccountStatus,
  ErrorCode,
  type Account,
  type Balance,
  type ListAccountsQuery,
  type UpdateAccountRequest,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import { ACCOUNT_TRANSACTION_LABEL } from './account.constants.js';
import { toContractAccount, toContractBalance } from './account.mapper.js';
import { AccountStore, type AccountPatchFields, type AccountRecord } from './account.store.js';

/**
 * Reading a customer's accounts, and the two things they may change about one.
 *
 * Opening lives in `AccountOpeningService` and status changes in
 * `AccountLifecycleService`; this service is the read path plus the two harmless writes,
 * which keeps the file that every controller touches free of the rules that move money.
 *
 * **Ownership is enforced here, once.** {@link requireOwned} is the only way a caller
 * gets an account from an id, and it answers `ACCOUNT_NOT_FOUND` — not `FORBIDDEN` — when
 * the account belongs to someone else. A 403 would confirm the account exists, which
 * turns an enumeration of `acc_` ids into a census of the bank; 404 tells an attacker
 * exactly what a wrong guess tells them.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /** The customer's accounts, newest first, filtered by the contract query. */
  async list(userId: string, query: ListAccountsQuery = {}): Promise<Account[]> {
    const records = await this.accounts.listByUser({ userId, ...definedFilters(query) });
    const asOf = this.clock.now();
    return records.map((record) => toContractAccount(record, asOf));
  }

  async get(userId: string, accountId: string): Promise<Account> {
    const record = await this.requireOwned(accountId, userId);
    return toContractAccount(record, this.clock.now());
  }

  /** The balance block on its own — the poll a dashboard makes every few seconds. */
  async balance(userId: string, accountId: string): Promise<Balance> {
    const record = await this.requireOwned(accountId, userId);
    return toContractBalance(record, this.clock.now());
  }

  /**
   * Applies a nickname and/or primary-account change.
   *
   * One transaction, because promoting an account demotes its predecessor and a customer
   * with two primary accounts — or none — is a state no reader knows how to render.
   */
  async update(userId: string, accountId: string, request: UpdateAccountRequest): Promise<Account> {
    return this.runner.run(
      async (session) => {
        const record = await this.requireOwned(accountId, userId, session);
        const fields = await this.resolveUpdate(record, request, session);
        const updated = await this.accounts.patch({ accountId, fields, session });

        if (!updated) throw AppError.notFound('Account', accountId);
        return toContractAccount(updated, this.clock.now());
      },
      { label: ACCOUNT_TRANSACTION_LABEL.UPDATE },
    );
  }

  /**
   * The account, or `ACCOUNT_NOT_FOUND` if it is missing *or* not this customer's.
   *
   * A joint holder counts as an owner: they are on `holderIds` and the money is as much
   * theirs as the primary holder's.
   */
  async requireOwned(
    accountId: string,
    userId: string,
    session?: ClientSession,
  ): Promise<AccountRecord> {
    const record = await this.accounts.findById(accountId, session);
    if (!record || !isHeldBy(record, userId)) throw accountNotFound(accountId);
    return record;
  }

  /**
   * The account regardless of who holds it.
   *
   * For the paths where ownership is not the question being asked — an inbound payment
   * crediting a beneficiary, an operator acting under a court order. Never reachable from
   * a customer-facing controller without an ownership check first.
   */
  async require(accountId: string, session?: ClientSession): Promise<AccountRecord> {
    const record = await this.accounts.findById(accountId, session);
    if (!record) throw accountNotFound(accountId);
    return record;
  }

  /** Resolution by domestic account number, for the transfer and payment rails. */
  async findByNumber(number: string, session?: ClientSession): Promise<AccountRecord | null> {
    return this.accounts.findByNumber(number, session);
  }

  private async resolveUpdate(
    record: AccountRecord,
    request: UpdateAccountRequest,
    session: ClientSession,
  ): Promise<AccountPatchFields> {
    const nickname = request.nickname === undefined ? {} : { nickname: request.nickname };
    if (request.isPrimary !== true) return nickname;

    assertPromotable(record);
    await this.accounts.clearPrimary({
      userId: record.userId,
      currency: record.currency,
      exceptAccountId: record.id,
      session,
    });

    return { ...nickname, isPrimary: true };
  }
}

/** Whether the customer is the owner or a joint holder. */
export function isHeldBy(record: AccountRecord, userId: string): boolean {
  return record.userId === userId || record.holderIds.includes(userId);
}

/**
 * The single "no such account" rejection.
 *
 * Exported so every path in the lane answers identically: a missing id, another
 * customer's id and a malformed id must be indistinguishable from the outside.
 */
export function accountNotFound(accountId: string): AppError {
  return new AppError({
    code: ErrorCode.ACCOUNT_NOT_FOUND,
    message: 'No such account.',
    context: { accountId },
  });
}

/** Only a live account can be the one a customer's salary and direct debits default to. */
function assertPromotable(record: AccountRecord): void {
  if (record.status === AccountStatus.ACTIVE) return;

  throw new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message: `An account that is ${record.status.toLowerCase()} cannot be made your primary account.`,
    context: { accountId: record.id, status: record.status },
  });
}

/** Drops absent filters so an unset query field does not become `{ status: undefined }`. */
function definedFilters(query: ListAccountsQuery) {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.currency ? { currency: query.currency } : {}),
  };
}
