import { Injectable } from '@nestjs/common';

import { type AdminUser } from '@reliance/contracts';

import { PasswordService } from '../auth/password.service.js';
import { TotpService } from '../mfa/totp.service.js';

import { AdminTokenService } from './admin-token.service.js';
import { AdminUserRepository } from './admin-user.repository.js';
import { AdminUserService } from './admin-user.service.js';
import {
  adminCredentialsRejected,
  adminDeactivated,
  adminMfaNotEnrolled,
  adminUnauthenticated,
  ipNotAllowed,
} from './rbac.errors.js';
import { type AdminUserDoc } from './schemas/admin-user.schema.js';

/** What the sign-in endpoint is given. */
export interface AdminSignInInput {
  readonly email: string;
  readonly password: string;
  readonly totpCode: string;
  /** Client address, for the operator's stored allowlist. */
  readonly ip: string;
}

/** A completed staff sign-in: the access token, and who it belongs to. */
export interface AdminSignIn {
  readonly token: string;
  readonly admin: AdminUser;
}

/**
 * The console's front door.
 *
 * The order of the checks is load-bearing, and it is the customer login's order for the
 * same reasons. A decoy hash for an unknown address, so "no such operator" costs what a
 * wrong password costs. Password before account status, so a stranger cannot learn who
 * works here by watching which addresses answer differently. The second factor after
 * both, and refused with the *same* error as a wrong password — the two are submitted
 * together precisely so that a refusal cannot separate them.
 *
 * TOTP is mandatory. There is no branch of this method that issues a token without a
 * verified code, and the token carries that as a claim the guard re-checks on every
 * request.
 */
@Injectable()
export class AdminLoginService {
  constructor(
    private readonly admins: AdminUserRepository,
    private readonly directory: AdminUserService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly tokens: AdminTokenService,
  ) {}

  /**
   * Verifies both factors and issues an admin access token.
   *
   * @throws {AppError} `INVALID_CREDENTIALS` for an unknown address, a wrong password or a
   *   wrong, replayed or expired code — indistinguishable by design; `ACCOUNT_SUSPENDED`
   *   for a deactivated operator; `MFA_NOT_ENROLLED` with no authenticator on the account;
   *   `IP_NOT_ALLOWED` from a network the operator's allowlist does not cover.
   */
  async signIn(input: AdminSignInInput): Promise<AdminSignIn> {
    const doc = await this.verifyPassword(input);
    if (!doc.active) throw adminDeactivated();

    await this.spendCode(doc, input.totpCode);
    assertAllowedNetwork(doc, input.ip);

    await this.directory.recordLogin(doc.id);

    // Re-read rather than map the credential-bearing document: the DTO the console gets
    // is then the same one `/admin/auth/me` answers with, carrying this login's timestamp
    // and no secret fields at all.
    const admin = await this.directory.describe(doc.id);
    if (!admin) throw adminUnauthenticated();

    return { token: await this.tokens.signAccess({ adminId: doc.id, mfaVerified: true }), admin };
  }

  /**
   * The first factor.
   *
   * An address with no account, and an account with no password set, both burn a real
   * Argon2 verification before failing — skipping it would make those cases measurably
   * faster than a wrong password and turn the endpoint into an oracle listing who works
   * here.
   */
  private async verifyPassword(input: AdminSignInInput): Promise<AdminUserDoc> {
    const doc = await this.admins.findCredentialsByEmail(input.email);

    if (!doc?.passwordHash) {
      await this.passwords.verifyAgainstDecoy(input.password);
      throw adminCredentialsRejected();
    }

    if (!(await this.passwords.verify(doc.passwordHash, input.password))) {
      throw adminCredentialsRejected();
    }

    return doc;
  }

  /**
   * The second factor, and its time step spent so the code cannot be presented twice.
   *
   * A missing enrolment is the one refusal here that names itself: no retry fixes it, and
   * the sign-in screen ends the attempt rather than asking for another code.
   */
  private async spendCode(doc: AdminUserDoc, code: string): Promise<void> {
    if (!doc.mfa.totpSecret || doc.mfa.enrolledAt === null) throw adminMfaNotEnrolled();

    const acceptance = await this.totp.check(doc.mfa.totpSecret, code, doc.mfa.lastTimeStep);
    if (!acceptance.accepted || acceptance.timeStep === null) throw adminCredentialsRejected();

    if (!(await this.admins.claimTotpStep(doc.id, acceptance.timeStep))) {
      throw adminCredentialsRejected();
    }
  }
}

/**
 * The stored allowlist, enforced at sign-in as well as on every later request.
 *
 * `IpAllowlistGuard` covers the authenticated surface, but a token issued to an operator
 * calling from an unlisted network would be a credential that exists and cannot be used —
 * so the refusal belongs here too, where the screen can state it plainly. Empty means
 * unrestricted, exactly as the guard reads it.
 */
function assertAllowedNetwork(doc: AdminUserDoc, ip: string): void {
  if (doc.ipAllowlist.length === 0) return;
  if (!doc.ipAllowlist.includes(ip)) throw ipNotAllowed();
}
