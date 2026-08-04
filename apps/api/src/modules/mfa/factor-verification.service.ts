import { Injectable } from '@nestjs/common';
import { type QueryFilter } from 'mongoose';

import { AppError } from '../../common/errors/app-error.js';
import { User, type UserDocument, UserRepository } from '../auth/users/index.js';

import { mfaInvalidCode, mfaNotEnrolled } from './mfa.errors.js';
import { passkeyAssertionSchema } from './mfa.schemas.js';
import { PasskeyService } from './passkey.service.js';
import { RecoveryCodeService } from './recovery-code.service.js';
import { TotpService } from './totp.service.js';

/**
 * Verifies a presented second factor against a user's enrolment.
 *
 * Shared by the login challenge, step-up and passkey flows so the replay rules live in
 * exactly one place. TOTP and recovery codes are spent *atomically*: the time step is
 * advanced by a conditional write, and a recovery code is consumed by pulling its hash in
 * the same statement that proves it was there. Two requests presenting the same factor
 * concurrently therefore have exactly one winner — read-then-write would let both through.
 */
@Injectable()
export class FactorVerificationService {
  constructor(
    private readonly users: UserRepository,
    private readonly totp: TotpService,
    private readonly recovery: RecoveryCodeService,
    private readonly passkeys: PasskeyService,
  ) {}

  /**
   * Checks an authenticator code and records its time step against replay.
   *
   * @throws {AppError} `MFA_NOT_ENROLLED` without an active enrolment; `MFA_INVALID_CODE`
   *   for a wrong code, a code from an already-spent time step, or a code that lost a
   *   concurrent race to spend that step.
   */
  async verifyTotp(userId: string, code: string): Promise<void> {
    const user = await this.requireCredentials(userId);
    if (!user.mfa.enrolled || !user.mfa.totpSecret) throw mfaNotEnrolled();

    const acceptance = await this.totp.check(user.mfa.totpSecret, code, user.mfa.lastTimeStep);
    if (!acceptance.accepted || acceptance.timeStep === null) throw mfaInvalidCode();

    const claimed = await this.users.updateOne(
      {
        id: user.id,
        $or: [{ 'mfa.lastTimeStep': null }, { 'mfa.lastTimeStep': { $lt: acceptance.timeStep } }],
      } as QueryFilter<User>,
      { $set: { 'mfa.lastTimeStep': acceptance.timeStep } },
    );
    if (!claimed) throw mfaInvalidCode();
  }

  /**
   * Spends a recovery code. Consumption *is* the verification: the `$pull` either removes
   * the hash, proving the code was unspent, or matches nothing and the code is wrong.
   *
   * @throws {AppError} `MFA_INVALID_CODE` for an unknown or already-spent code.
   */
  async consumeRecoveryCode(userId: string, code: string): Promise<void> {
    const hash = this.recovery.hashOf(code);
    const consumed = await this.users.updateOne(
      { id: userId, 'mfa.recoveryCodeHashes': hash } as QueryFilter<User>,
      { $pull: { 'mfa.recoveryCodeHashes': hash } },
    );
    if (!consumed) throw mfaInvalidCode();
  }

  /**
   * Verifies a passkey assertion carried as a JSON string.
   *
   * The step-up and challenge contracts carry the assertion inside a string field, so the
   * JSON parse is part of verification: an unparseable blob is a wrong factor, not a 500.
   *
   * @throws {AppError} `MFA_INVALID_CODE` for a malformed payload; the passkey errors
   *   from `PasskeyService` otherwise.
   */
  async verifyPasskey(userId: string, credential: string): Promise<void> {
    const parsed = parseAssertion(credential);
    await this.passkeys.verifyAssertion(userId, {
      challengeId: parsed.challengeId,
      credential: parsed.credential,
    });
  }

  private async requireCredentials(userId: string): Promise<UserDocument> {
    const user = await this.users.findCredentialsById(userId);
    if (!user) throw AppError.notFound('User', userId);
    return user;
  }
}

/** Parses the JSON assertion wrapper, treating any failure as a wrong factor. */
function parseAssertion(credential: string): {
  challengeId: string;
  credential: Record<string, unknown>;
} {
  try {
    return passkeyAssertionSchema.parse(JSON.parse(credential));
  } catch {
    throw mfaInvalidCode();
  }
}
