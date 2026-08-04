import { Injectable } from '@nestjs/common';

import { MfaMethod } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { type UserDocument, UserRepository } from '../auth/users/index.js';

import { mfaAlreadyEnrolled, mfaInvalidCode, mfaNotEnrolled } from './mfa.errors.js';
import { RecoveryCodeService } from './recovery-code.service.js';
import { TotpService } from './totp.service.js';

/** What the enrolment endpoint returns: everything an authenticator app needs, once. */
export interface TotpEnrolmentOffer {
  secret: string;
  otpauthUri: string;
  qrCodeDataUri: string;
}

/** A freshly minted set of recovery codes, shown exactly once. */
export interface RecoveryCodeIssue {
  codes: string[];
  generatedAt: string;
}

/**
 * The TOTP enrolment lifecycle on the `user.mfa` sub-document.
 *
 * Enrolment is two steps with a real state between them: the secret sits on the document
 * unconfirmed until a generated code proves the customer actually scanned it. An
 * unconfirmed secret is never honoured as a factor — {@link FactorVerificationService}
 * requires `enrolled` — so abandoning the flow halfway leaves no half-working MFA behind.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly users: UserRepository,
    private readonly totp: TotpService,
    private readonly recovery: RecoveryCodeService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Mints a pending secret and returns what to display. Replaces any earlier pending
   * (unconfirmed) secret, so restarting the flow needs no cleanup.
   *
   * @throws {AppError} `MFA_ALREADY_ENROLLED` when a confirmed enrolment exists — change
   *   requires a step-up-gated disable first.
   */
  async beginEnrolment(userId: string): Promise<TotpEnrolmentOffer> {
    const user = await this.requireCredentials(userId);
    if (user.mfa.enrolled) throw mfaAlreadyEnrolled();

    const enrolment = await this.totp.createEnrolment(user.email);
    await this.users.patch(userId, { $set: { 'mfa.totpSecret': enrolment.sealedSecret } });

    return {
      secret: enrolment.secret,
      otpauthUri: enrolment.otpauthUri,
      qrCodeDataUri: enrolment.qrCodeDataUri,
    };
  }

  /**
   * Promotes a pending secret to a live factor on proof of a generated code.
   *
   * The code is checked against the same replay rules as any other verification; the
   * accepted time step becomes the enrolment's starting point, so the confirmation code
   * itself cannot be replayed as the first login code.
   *
   * @throws {AppError} `MFA_NOT_ENROLLED` with no pending secret; `MFA_INVALID_CODE`.
   */
  async confirmEnrolment(userId: string, code: string): Promise<void> {
    const user = await this.requireCredentials(userId);
    if (user.mfa.enrolled) throw mfaAlreadyEnrolled();
    if (!user.mfa.totpSecret) throw mfaNotEnrolled();

    const acceptance = await this.totp.check(user.mfa.totpSecret, code, null);
    if (!acceptance.accepted) throw mfaInvalidCode();

    await this.users.patch(userId, {
      $set: {
        'mfa.enrolled': true,
        'mfa.enrolledAt': this.clock.now(),
        'mfa.lastTimeStep': acceptance.timeStep,
      },
      $addToSet: { 'mfa.methods': MfaMethod.TOTP },
    });
  }

  /**
   * Removes TOTP and every factor that only makes sense alongside it.
   *
   * Recovery codes exist to rescue a lost authenticator; with no authenticator they are
   * just spare keys, so they are destroyed with the enrolment. Step-up-gated at the
   * controller: weakening an account's own defences is a sensitive action.
   */
  async disable(userId: string): Promise<void> {
    const user = await this.requireCredentials(userId);
    if (!user.mfa.enrolled) throw mfaNotEnrolled();

    await this.users.patch(userId, {
      $set: {
        'mfa.totpSecret': null,
        'mfa.enrolled': false,
        'mfa.enrolledAt': null,
        'mfa.lastTimeStep': null,
        'mfa.recoveryCodeHashes': [],
        'mfa.methods': user.mfa.methods.filter((method) => method === MfaMethod.PASSKEY),
      },
    });
  }

  /**
   * Mints a new set of recovery codes, destroying the old set in the same write.
   *
   * Regeneration rather than reveal: the server stores hashes, so there is nothing to
   * reveal — anyone holding the old codes keeps them only until this endpoint runs, which
   * is the behaviour a customer wants when they are not sure where the old sheet ended up.
   *
   * @throws {AppError} `MFA_NOT_ENROLLED` — codes without a factor to recover are pointless.
   */
  async regenerateRecoveryCodes(userId: string): Promise<RecoveryCodeIssue> {
    const user = await this.requireCredentials(userId);
    if (!user.mfa.enrolled) throw mfaNotEnrolled();

    const set = this.recovery.generate();
    await this.users.patch(userId, { $set: { 'mfa.recoveryCodeHashes': set.hashes } });

    return { codes: set.codes, generatedAt: this.clock.now().toISOString() };
  }

  private async requireCredentials(userId: string): Promise<UserDocument> {
    const user = await this.users.findCredentialsById(userId);
    if (!user) throw AppError.notFound('User', userId);
    return user;
  }
}
