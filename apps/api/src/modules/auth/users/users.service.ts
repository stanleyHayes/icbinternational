import { Injectable } from '@nestjs/common';

import { ErrorCode, UserStatus, type CustomerSegment } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';

import { type UserDocument } from './schemas/user.schema.js';
import { UserRepository, type UniqueUserField } from './user.repository.js';

/** Everything needed to open a customer identity. Credentials arrive already hashed. */
export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  segment: CustomerSegment;
  locale: string;
  baseCurrency: string;
  marketingOptIn: boolean;
}

/** Lockout thresholds, supplied by the caller so the policy stays configuration. */
export interface LockoutPolicy {
  maxAttempts: number;
  lockoutMinutes: number;
}

/**
 * Customer identity lifecycle.
 *
 * Deliberately knows nothing about passwords beyond the fact that a hash is an opaque
 * string: hashing belongs to `PasswordService`, and keeping the two apart means this
 * service can be read as the answer to "what may happen to a user record" without also
 * being the answer to "how do we store a secret".
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /**
   * Opens a new identity in `PENDING_VERIFICATION`.
   *
   * @throws {AppError} `EMAIL_ALREADY_REGISTERED` or `PHONE_ALREADY_REGISTERED` when a
   *   unique index rejects the insert.
   */
  async createCustomer(input: CreateUserInput): Promise<UserDocument> {
    const now = this.clock.now();
    const result = await this.users.insertUnique({
      id: this.ids.generate('user'),
      email: input.email,
      passwordHash: input.passwordHash,
      passwordChangedAt: now,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      segment: input.segment,
      locale: input.locale,
      baseCurrency: input.baseCurrency,
      marketingOptIn: input.marketingOptIn,
      termsAcceptedAt: now,
      status: UserStatus.PENDING_VERIFICATION,
    });

    if (result.user) return result.user;

    const conflict = REGISTRATION_CONFLICTS[result.conflictOn];
    throw AppError.conflict(conflict.code, conflict.message);
  }

  /** Reads a user by public id, or throws `NOT_FOUND`. */
  async requireById(id: string): Promise<UserDocument> {
    const user = await this.users.findById(id);
    if (!user) throw AppError.notFound('User', id);
    return user as UserDocument;
  }

  /** Reads a user by public id including credentials, or throws `NOT_FOUND`. */
  async requireCredentialsById(id: string): Promise<UserDocument> {
    const user = await this.users.findCredentialsById(id);
    if (!user) throw AppError.notFound('User', id);
    return user;
  }

  /**
   * Marks the address confirmed and activates the account.
   *
   * Idempotent by design: a customer who clicks the link twice, or whose mail client
   * pre-fetches it, must see success rather than a confusing failure.
   */
  async markEmailVerified(userId: string): Promise<UserDocument> {
    const user = await this.users.patch(userId, {
      $set: { emailVerified: true, status: UserStatus.ACTIVE },
    });
    if (!user) throw AppError.notFound('User', userId);
    return user;
  }

  /** Clears the failure budget and stamps the login. */
  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.users.patch(userId, {
      $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: this.clock.now() },
    });
  }

  /**
   * Counts a failed attempt and locks the account once the budget is spent.
   *
   * The counter is incremented server-side with `$inc` rather than read-modify-written, so
   * a burst of parallel guesses each costs an attempt instead of racing to overwrite one
   * another and effectively getting the tries for free.
   */
  async recordFailedLogin(userId: string, policy: LockoutPolicy): Promise<void> {
    const updated = await this.users.patch(userId, { $inc: { failedLoginAttempts: 1 } });
    if (!updated || updated.failedLoginAttempts < policy.maxAttempts) return;

    await this.users.patch(userId, {
      $set: { lockedUntil: this.clock.inMinutes(policy.lockoutMinutes) },
    });
  }

  /** True while a lockout window is still running. */
  isLockedOut(user: UserDocument): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > this.clock.timestamp();
  }

  /**
   * Refuses authentication for any status other than `ACTIVE`.
   *
   * Called only after the password has been verified. Checking it earlier would make an
   * unverified or suspended account answer differently — and faster — than a healthy one,
   * which is exactly the signal an attacker enumerating addresses is looking for.
   */
  assertCanAuthenticate(user: UserDocument): void {
    if (user.status === UserStatus.ACTIVE) return;

    const rejection = STATUS_REJECTIONS[user.status];
    throw new AppError({ code: rejection.code, message: rejection.message });
  }

  /** Replaces the stored hash and moves `passwordChangedAt`, invalidating reset links. */
  async replacePassword(userId: string, passwordHash: string): Promise<UserDocument> {
    const user = await this.users.patch(userId, {
      $set: {
        passwordHash,
        passwordChangedAt: this.clock.now(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    if (!user) throw AppError.notFound('User', userId);
    return user;
  }
}

/** How a collision on each unique index is reported to the person signing up. */
const REGISTRATION_CONFLICTS: Record<UniqueUserField, { code: ErrorCode; message: string }> = {
  email: {
    code: ErrorCode.EMAIL_ALREADY_REGISTERED,
    message: 'That email address is already registered.',
  },
  phone: {
    code: ErrorCode.PHONE_ALREADY_REGISTERED,
    message: 'That phone number is already registered.',
  },
};

/** Why each non-active status cannot log in. Ordered by how the customer recovers from it. */
const STATUS_REJECTIONS: Record<
  Exclude<UserStatus, typeof UserStatus.ACTIVE>,
  { code: ErrorCode; message: string }
> = {
  [UserStatus.PENDING_VERIFICATION]: {
    code: ErrorCode.EMAIL_NOT_VERIFIED,
    message: 'Confirm your email address before signing in. We can send the link again.',
  },
  [UserStatus.LOCKED]: {
    code: ErrorCode.ACCOUNT_LOCKED,
    message: 'This account is locked. Contact support to unlock it.',
  },
  [UserStatus.SUSPENDED]: {
    code: ErrorCode.ACCOUNT_SUSPENDED,
    message: 'This account is suspended. Contact support.',
  },
  [UserStatus.CLOSED]: {
    code: ErrorCode.FORBIDDEN,
    message: 'This account has been closed.',
  },
};
