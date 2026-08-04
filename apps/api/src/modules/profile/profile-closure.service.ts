/**
 * Closing the whole relationship.
 *
 * The most destructive thing a customer can ask this API to do, so it is arranged in two
 * strictly separate phases:
 *
 * 1. **Assess, changing nothing.** Everything in the way is gathered and reported at once.
 *    A refusal that arrives after three accounts have already been closed is worse than no
 *    closure at all, and a refusal that names one blocker at a time makes the customer
 *    discover the bank's rules by repeatedly failing.
 * 2. **Close, only when nothing is in the way.** Each account goes through
 *    `AccountClosureService` rather than a status write here, so the one place that knows
 *    how to close an account stays the one place that does it.
 *
 * The sweep the single-account closure offers has no counterpart here. Every destination it
 * would accept is another of the customer's own live accounts, and those are being closed
 * too — so a relationship closure has nowhere inside the bank to put residual money, and
 * the balance blocker says so in as many words. `sweepToAccountId` is therefore checked
 * for sense and never acted on; see `profile.dto.ts`.
 *
 * Sessions are revoked last. A closed customer who stays signed in for the life of their
 * access token can still read statements from an account the bank has told them is gone.
 */

import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode, UserStatus, type CloseAccountRequest } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { AccountClosureService } from '../accounts/index.js';
import { SessionRevocation } from '../auth/auth.constants.js';
import { SessionService } from '../auth/session.service.js';
import { UserRepository, UsersService } from '../auth/users/index.js';

import { ClosureAssessmentService } from './closure-assessment.service.js';
import { type ClosureBlocker } from './closure-blockers.js';
import { type CloseCustomerAccount } from './profile.dto.js';

/**
 * The customer is not sweeping anything — the precondition already guarantees every account
 * is empty — but `AccountClosureService` takes a reason and records it against the closure.
 */
const NO_SWEEP: CloseAccountRequest = { reason: 'Customer closed their Reliance Bank account' };

@Injectable()
export class ProfileClosureService {
  private readonly logger = new Logger(ProfileClosureService.name);

  constructor(
    private readonly assessment: ClosureAssessmentService,
    private readonly closures: AccountClosureService,
    private readonly users: UsersService,
    private readonly userRecords: UserRepository,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Closes every account the customer holds and ends the relationship.
   *
   * Idempotent for a customer who is already closed: they asked for a state that already
   * holds, and failing them for tapping twice would only send them to the phone.
   *
   * @throws {AppError} `PRECONDITION_FAILED` listing everything in the way.
   */
  async close(userId: string, request: CloseCustomerAccount): Promise<void> {
    const user = await this.users.requireById(userId);
    if (user.status === UserStatus.CLOSED) return;

    await this.assertNominatedAccountIsTheirs(userId, request.sweepToAccountId);

    const blockers = await this.assessment.blockers(userId);
    if (blockers.length > 0) throw stillOpen(blockers);

    await this.closeAccounts(userId);
    await this.retireIdentity(userId, request.reason);
  }

  /** What is in the way, for a screen that wants to show it before the customer commits. */
  async blockers(userId: string): Promise<ClosureBlocker[]> {
    return this.assessment.blockers(userId);
  }

  /**
   * Closes the accounts one at a time, in their own transactions.
   *
   * Sequential rather than parallel: `AccountClosureService` retries on write conflict, and
   * a customer's accounts are exactly the documents most likely to conflict with each other.
   *
   * Not atomic across accounts, and deliberately so. Each closure is complete and correct on
   * its own, so a failure part-way leaves closed accounts closed and the rest untouched —
   * a state the customer can simply ask to finish. Wrapping them in one transaction would
   * trade that for a single retry-storm-prone write across every account they hold.
   *
   * The pre-flight is not load-bearing for safety either. `AccountClosureService` re-reads
   * the account inside its own transaction and refuses a residual balance or a live hold on
   * its own account, so money arriving between the assessment and this loop is still caught
   * — just reported per account rather than as one aggregated list. The pre-flight exists to
   * make the common refusal complete and to make it arrive before anything has changed, not
   * to be the only thing standing between a customer and a lost balance.
   */
  private async closeAccounts(userId: string): Promise<void> {
    for (const account of await this.assessment.accountsOf(userId)) {
      await this.closures.close({ userId, accountId: account.id, request: NO_SWEEP });
    }
  }

  /** Marks the identity closed and signs every device out of it. */
  private async retireIdentity(userId: string, reason: string): Promise<void> {
    await this.userRecords.patch(userId, { $set: { status: UserStatus.CLOSED } });
    await this.sessions.revokeAllForUser(userId, SessionRevocation.REMOTE_REVOKE);
    this.logger.log(`Closed the relationship with ${userId}: ${reason}`);
  }

  /**
   * A nominated account has to be the customer's own.
   *
   * Nothing is swept to it — see this file's header — but a customer who names an account
   * that is not theirs has misunderstood something, and answering "closed" to that request
   * would confirm the misunderstanding. An id belonging to somebody else reads exactly like
   * one that does not exist, which is the only answer that is not an enumeration oracle.
   */
  private async assertNominatedAccountIsTheirs(
    userId: string,
    accountId: string | undefined,
  ): Promise<void> {
    if (!accountId) return;

    const held = await this.assessment.accountsOf(userId);
    if (held.some((account) => account.id === accountId)) return;

    throw AppError.validation('We could not find that account.', [
      { path: 'sweepToAccountId', message: 'Choose one of your own accounts' },
    ]);
  }
}

/**
 * The refusal, carrying every reason at once.
 *
 * `PRECONDITION_FAILED` rather than a conflict: nothing about the request is wrong, and
 * nothing about it collides with another writer. The customer simply has to do some things
 * first, and the message says which.
 */
function stillOpen(blockers: readonly ClosureBlocker[]): AppError {
  return new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message:
      'There are a few things to sort out before we can close your account. ' +
      blockers.map((blocker) => blocker.reason).join(' '),
    details: blockers.map((blocker) => ({ path: blocker.kind, message: blocker.reason })),
  });
}
