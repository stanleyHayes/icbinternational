import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppConfigService } from '../../config/config.service.js';

import { accountLocked, invalidCredentials } from './auth.errors.js';
import { type UserDocument, UsersService, type LockoutPolicy } from './users/index.js';

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/**
 * Who may log in, and what a failed attempt costs.
 *
 * The policy questions of authentication — how many guesses a password gets, how long a
 * lockout lasts, which account states may authenticate at all — gathered behind one
 * collaborator so the login use-case reads as a sequence of decisions, not a pile of
 * counters. Thresholds come from configuration; the counters live on the user record.
 */
@Injectable()
export class LoginPolicy {
  constructor(
    private readonly users: UsersService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Refuses a login while a lockout window is still running.
   *
   * Checked before the password is verified: a locked account must not get cheaper
   * guesses, and the remaining time goes back to the client so it can show a countdown
   * instead of letting the customer hammer the button.
   *
   * @throws {AppError} `ACCOUNT_LOCKED` with `retryAfterSeconds`.
   */
  assertNotLocked(user: UserDocument): void {
    if (!this.users.isLockedOut(user)) return;

    const lockedUntilMs = user.lockedUntil?.getTime() ?? this.clock.timestamp();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((lockedUntilMs - this.clock.timestamp()) / MILLISECONDS_PER_SECOND),
    );
    throw accountLocked(retryAfterSeconds);
  }

  /**
   * Refuses a login for any account status other than `ACTIVE`.
   *
   * Called only after the password has verified — answering earlier would make an
   * unverified or suspended account distinguishable from a wrong password, which is an
   * enumeration oracle. See `UsersService.assertCanAuthenticate`.
   */
  assertStatusAllowsLogin(user: UserDocument): void {
    this.users.assertCanAuthenticate(user);
  }

  /**
   * Spends one guess from the failure budget.
   *
   * @throws {AppError} always — `ACCOUNT_LOCKED` when this guess spends the budget,
   *   otherwise the same `INVALID_CREDENTIALS` an unknown email produces.
   */
  async recordFailure(user: UserDocument): Promise<never> {
    const policy = this.policy;
    await this.users.recordFailedLogin(user.id, policy);

    if (user.failedLoginAttempts + 1 >= policy.maxAttempts) {
      throw accountLocked(policy.lockoutMinutes * SECONDS_PER_MINUTE);
    }
    throw invalidCredentials();
  }

  /** Clears the failure budget and stamps the login time. */
  async recordSuccess(userId: string): Promise<void> {
    await this.users.recordSuccessfulLogin(userId);
  }

  private get policy(): LockoutPolicy {
    return {
      maxAttempts: this.config.rateLimit.loginMaxAttempts,
      lockoutMinutes: this.config.rateLimit.loginLockoutMinutes,
    };
  }
}
