import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import {
  AccountStatus,
  ErrorCode,
  type Account,
  type OpenAccountRequest,
} from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import { AccountEligibilityService, type OpeningPlan } from './account-eligibility.service.js';
import {
  ACCOUNT_TRANSACTION_LABEL,
  MAX_IDENTIFIER_ALLOCATION_ATTEMPTS,
  MAX_OPEN_ACCOUNTS_PER_CUSTOMER,
} from './account.constants.js';
import { AccountFactory } from './account.factory.js';
import { toContractAccount } from './account.mapper.js';
import { AccountStore, type AccountRecord } from './account.store.js';

/**
 * Opening an account.
 *
 * The whole operation is one transaction over one collection, so it is cheap; what it
 * buys is that a customer can never end up holding an account number that was minted,
 * collided and abandoned. The eligibility decision and the document itself are built by
 * collaborators, leaving this service with the two things that genuinely need the
 * database: the portfolio-level rules, and surviving a unique-index collision.
 */
@Injectable()
export class AccountOpeningService {
  private readonly logger = new Logger(AccountOpeningService.name);

  constructor(
    private readonly accounts: AccountStore,
    private readonly eligibility: AccountEligibilityService,
    private readonly factory: AccountFactory,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Opens an account for a customer.
   *
   * @throws {AppError} `ACCOUNT_LIMIT_REACHED` past the portfolio cap; whatever the
   *   eligibility rules refused; `CONFLICT` if the identifier space could not yield an
   *   unused number.
   */
  async open(input: { userId: string; request: OpenAccountRequest }): Promise<Account> {
    const record = await this.runner.run(
      async (session) => {
        const plan = await this.eligibility.plan(input);
        const portfolio = await this.accounts.listByUser({ userId: input.userId, session });

        assertUnderCap(portfolio, input.userId);
        return this.insertWithUniqueIdentifiers({
          plan,
          isPrimary: !hasPrimary(portfolio, plan.currency),
          session,
        });
      },
      { label: ACCOUNT_TRANSACTION_LABEL.OPEN },
    );

    this.logger.log(`Opened ${record.type} account ${record.id} on ${record.productCode}`);
    // Nothing has moved yet, so the account's own opening instant is the honest `asOf`
    // for its balances — and it avoids a second clock read inside the response path.
    return toContractAccount(record, record.openedAt);
  }

  /**
   * Inserts, regenerating the identifiers if a unique index rejects them.
   *
   * The pre-read in `AccountNumberService` narrows this to a genuine race, which needs a
   * retry rather than an error: the customer did nothing wrong and the serial space is
   * nowhere near full.
   */
  private async insertWithUniqueIdentifiers(input: {
    plan: OpeningPlan;
    isPrimary: boolean;
    session: ClientSession;
  }): Promise<AccountRecord> {
    for (let attempt = 1; attempt <= MAX_IDENTIFIER_ALLOCATION_ATTEMPTS; attempt += 1) {
      const draft = await this.factory.build(input);
      const result = await this.accounts.insert(draft, input.session);

      if (result.account) return result.account;

      this.logger.warn(
        `Account ${result.conflictOn} ${draft.number} was taken; retrying (attempt ${attempt})`,
      );
    }

    throw new AppError({
      code: ErrorCode.CONFLICT,
      message: 'Could not allocate an account number. Please try again.',
      context: { attempts: MAX_IDENTIFIER_ALLOCATION_ATTEMPTS },
    });
  }
}

/** Closed accounts do not count: a customer who closes one has freed the slot. */
function assertUnderCap(portfolio: readonly AccountRecord[], userId: string): void {
  const open = portfolio.filter((account) => account.status !== AccountStatus.CLOSED).length;
  if (open < MAX_OPEN_ACCOUNTS_PER_CUSTOMER) return;

  throw new AppError({
    code: ErrorCode.ACCOUNT_LIMIT_REACHED,
    message: `You can hold ${MAX_OPEN_ACCOUNTS_PER_CUSTOMER} open accounts. Close one to open another.`,
    context: { userId, open },
  });
}

/**
 * Whether the customer already has a default account in this currency.
 *
 * The first account a customer opens in a currency becomes their primary one, so the
 * dashboard always has somewhere to land and a payment request always has a default
 * destination. Closed accounts are ignored, so closing a primary leaves the next account
 * opened in that currency to inherit the role.
 */
function hasPrimary(portfolio: readonly AccountRecord[], currency: string): boolean {
  return portfolio.some(
    (account) =>
      account.isPrimary && account.currency === currency && account.status !== AccountStatus.CLOSED,
  );
}
