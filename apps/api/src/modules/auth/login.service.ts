import { Injectable } from '@nestjs/common';

import { type LoginRequest, type MfaMethod, type User as UserView } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { LoginGateKind, LoginMfaGate } from '../devices/login-mfa.gate.js';

import { SessionRevocation } from './auth.constants.js';
import { invalidCredentials, unauthenticated } from './auth.errors.js';
import { type AuthenticatedUser, type RequestOrigin } from './auth.types.js';
import { LoginPolicy } from './login-policy.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { toUserView, UserRepository } from './users/index.js';

/** A completed authentication: the user view plus the freshly minted token pair. */
export interface AuthSuccess {
  user: UserView;
  accessToken: string;
  refreshToken: string;
}

/** Credentials verified, but a second factor is owed before a session is issued. */
export interface MfaChallenge {
  challengeId: string;
  methods: MfaMethod[];
  expiresAt: string;
}

/** What {@link LoginService.login} resolves to: a session, or a challenge to answer first. */
export type LoginOutcome = AuthSuccess | MfaChallenge;

/**
 * The session lifecycle: login, refresh, logout, and "who am I".
 *
 * The order of checks in {@link login} is deliberate and load-bearing: decoy verification
 * for unknown addresses, lockout before password, account status only after a correct
 * password. Reorder them and the endpoint starts answering "does this email bank here"
 * for anyone who asks.
 */
@Injectable()
export class LoginService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly policy: LoginPolicy,
    private readonly mfaGate: LoginMfaGate,
  ) {}

  /**
   * Verifies credentials and either starts a session family or issues an MFA challenge.
   *
   * @throws {AppError} `INVALID_CREDENTIALS` for an unknown address or wrong password —
   *   indistinguishable by design; `ACCOUNT_LOCKED` while a lockout runs; the status
   *   rejections (`EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED`, …) after a correct password.
   */
  async login(input: LoginRequest, origin: RequestOrigin): Promise<LoginOutcome> {
    const user = await this.users.findCredentialsByEmail(input.email);
    if (!user) {
      await this.passwords.verifyAgainstDecoy(input.password);
      throw invalidCredentials();
    }

    this.policy.assertNotLocked(user);

    const passwordMatches = await this.passwords.verify(user.passwordHash, input.password);
    if (!passwordMatches) await this.policy.recordFailure(user);

    this.policy.assertStatusAllowsLogin(user);
    await this.policy.recordSuccess(user.id);

    // A blocked device is refused here, and an enrolled account on an untrusted device is
    // owed a second factor before any session exists — the gate decides which.
    const gate = await this.mfaGate.decide({
      user,
      fingerprint: input.deviceFingerprint,
      rememberDevice: input.rememberDevice,
      origin,
    });
    if (gate.kind === LoginGateKind.CHALLENGE) {
      return { challengeId: gate.challengeId, methods: gate.methods, expiresAt: gate.expiresAt };
    }

    const bundle = await this.sessions.create(user.id, gate.deviceId, origin);
    return {
      user: toUserView(user),
      accessToken: bundle.accessToken,
      refreshToken: bundle.refreshToken,
    };
  }

  /**
   * Rotates the refresh token and answers with the current user.
   *
   * @throws {AppError} `UNAUTHENTICATED` when no token was presented; the rotation errors
   *   (`TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_REUSE_DETECTED`) from `SessionService`.
   */
  async refresh(refreshToken: string | undefined, origin: RequestOrigin): Promise<AuthSuccess> {
    if (!refreshToken) throw unauthenticated();

    const bundle = await this.sessions.rotate(refreshToken, origin);
    const user = await this.users.findById(bundle.session.userId);
    if (!user) throw AppError.notFound('User', bundle.session.userId);

    return {
      user: toUserView(user),
      accessToken: bundle.accessToken,
      refreshToken: bundle.refreshToken,
    };
  }

  /** Ends the caller's own session. Other sessions in the family are untouched. */
  async logout(auth: AuthenticatedUser): Promise<void> {
    await this.sessions.revoke(auth.sessionId, SessionRevocation.LOGGED_OUT);
  }

  /** The caller's own identity, read fresh — not the claims snapshot. */
  async me(auth: AuthenticatedUser): Promise<UserView> {
    const user = await this.users.findById(auth.userId);
    if (!user) throw AppError.notFound('User', auth.userId);
    return toUserView(user);
  }
}
