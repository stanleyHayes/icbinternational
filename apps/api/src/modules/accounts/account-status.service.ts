import { Injectable, Logger } from '@nestjs/common';

import { AccountStatus, ErrorCode, type Account } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import { ACCOUNT_TRANSACTION_LABEL, DORMANCY_DAYS } from './account.constants.js';
import { toContractAccount } from './account.mapper.js';
import { accountNotFound } from './account.service.js';
import { AccountStore, type AccountRecord } from './account.store.js';

/** Statuses a freeze may be applied to. A closed account is already beyond freezing. */
const FREEZABLE: readonly AccountStatus[] = [
  AccountStatus.PENDING,
  AccountStatus.ACTIVE,
  AccountStatus.DORMANT,
];

/** How many accounts one dormancy sweep marks. Bounded so a job cannot run for hours. */
const DORMANCY_SWEEP_BATCH = 500;

const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;

/**
 * Status changes that do not move money: freeze, unfreeze and dormancy.
 *
 * Freezing is an operations and compliance action, not a customer one — there is no
 * customer-facing route for it in the contract, and there should not be. It is exposed as
 * a service so the admin console and the fraud engine can call it, and so a court order
 * has somewhere to land.
 *
 * A frozen account refuses postings in *both* directions. That is the deliberate reading
 * of a freeze: an inbound credit to an account under investigation is exactly the money
 * an investigator wants stopped at the door, not absorbed and then argued about.
 */
@Injectable()
export class AccountStatusService {
  private readonly logger = new Logger(AccountStatusService.name);

  constructor(
    private readonly accounts: AccountStore,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Freezes an account.
   *
   * Idempotent: freezing an already-frozen account succeeds and changes nothing, because
   * the caller is usually a rule engine that may fire twice on the same signal.
   *
   * @throws {AppError} `ACCOUNT_CLOSED` for an account that is closed or closing.
   */
  async freeze(input: { accountId: string; reason: string }): Promise<Account> {
    return this.transition({
      accountId: input.accountId,
      to: AccountStatus.FROZEN,
      from: FREEZABLE,
      alreadyThere: AccountStatus.FROZEN,
      reason: input.reason,
    });
  }

  /**
   * Lifts a freeze, returning the account to active use.
   *
   * Always to `ACTIVE`, never back to the status it held before. A pending account whose
   * deposit arrived while it was frozen has met its minimum, and a dormant one has just
   * had an operator's attention — both are live by any honest reading.
   */
  async unfreeze(input: { accountId: string; reason: string }): Promise<Account> {
    return this.transition({
      accountId: input.accountId,
      to: AccountStatus.ACTIVE,
      from: [AccountStatus.FROZEN],
      alreadyThere: AccountStatus.ACTIVE,
      reason: input.reason,
    });
  }

  /**
   * Marks accounts dormant after a year of silence.
   *
   * Dormancy is bookkeeping: it drives escheatment reporting and lets the dashboard stop
   * showing an account the customer has forgotten. It restricts nothing — the next
   * posting wakes the account inside the same transaction that credits it.
   *
   * @returns How many accounts were marked. Zero is the steady state.
   */
  async sweepDormant(): Promise<number> {
    const quietSince = new Date(
      this.clock.timestamp() - DORMANCY_DAYS * HOURS_PER_DAY * MS_PER_HOUR,
    );
    const candidates = await this.accounts.listDormancyCandidates({
      quietSince,
      limit: DORMANCY_SWEEP_BATCH,
    });

    const now = this.clock.now();
    for (const candidate of candidates) {
      await this.accounts.patch({
        accountId: candidate.id,
        expectedVersion: candidate.version,
        fields: { status: AccountStatus.DORMANT, dormantAt: now },
      });
    }

    if (candidates.length > 0) {
      this.logger.log(`Marked ${candidates.length} accounts dormant`);
    }
    return candidates.length;
  }

  private async transition(input: TransitionInput): Promise<Account> {
    const record = await this.runner.run(
      async (session) => {
        const account = await this.accounts.findById(input.accountId, session);
        if (!account) throw accountNotFound(input.accountId);
        if (account.status === input.alreadyThere) return account;

        assertTransitionAllowed(account, input);
        const updated = await this.accounts.patch({
          accountId: account.id,
          expectedVersion: account.version,
          fields: { status: input.to },
          session,
        });

        if (!updated) throw accountNotFound(input.accountId);
        return updated;
      },
      { label: ACCOUNT_TRANSACTION_LABEL.UPDATE },
    );

    this.logger.warn(`Account ${record.id} is now ${record.status}: ${input.reason}`);
    return toContractAccount(record, this.clock.now());
  }
}

interface TransitionInput {
  readonly accountId: string;
  readonly to: AccountStatus;
  readonly from: readonly AccountStatus[];
  /** The status that makes this a no-op rather than an error. */
  readonly alreadyThere: AccountStatus;
  readonly reason: string;
}

function assertTransitionAllowed(account: AccountRecord, input: TransitionInput): void {
  if (input.from.includes(account.status)) return;

  throw new AppError({
    code:
      account.status === AccountStatus.CLOSED || account.status === AccountStatus.CLOSING
        ? ErrorCode.ACCOUNT_CLOSED
        : ErrorCode.PRECONDITION_FAILED,
    message: `An account that is ${account.status.toLowerCase()} cannot become ${input.to.toLowerCase()}.`,
    context: { accountId: account.id, status: account.status, requested: input.to },
  });
}
