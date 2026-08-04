import { Injectable } from '@nestjs/common';

import { AuthTokenKind, SessionRevocation } from './auth.constants.js';
import { invalidCredentials } from './auth.errors.js';
import { type AuthenticatedUser } from './auth.types.js';
import { EmailTokenService } from './email-token.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { UsersService } from './users/index.js';

/**
 * Password replacement, both paths.
 *
 * A reset from an emailed link revokes *every* session: the link is proof the mailbox is
 * reachable but says nothing about which sessions are honest. A change from a logged-in
 * session revokes every *other* session but spares the caller — they just proved the
 * current password, the strongest signal available.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly emailTokens: EmailTokenService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Sets a new password from an emailed reset link.
   *
   * @throws {AppError} `TOKEN_INVALID` for a spent, expired or unknown link.
   */
  async reset(token: string, newPassword: string): Promise<void> {
    const record = await this.emailTokens.redeem(token, AuthTokenKind.PASSWORD_RESET);
    const passwordHash = await this.passwords.hash(newPassword);

    await this.users.replacePassword(record.userId, passwordHash);
    await this.emailTokens.revokeAllForUser(record.userId, AuthTokenKind.PASSWORD_RESET);
    await this.sessions.revokeAllForUser(record.userId, SessionRevocation.PASSWORD_CHANGED);
  }

  /**
   * Changes the password from an authenticated session.
   *
   * @throws {AppError} `INVALID_CREDENTIALS` when the current password does not match —
   *   deliberately the same error a failed login gives.
   */
  async change(
    auth: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.requireCredentialsById(auth.userId);

    const matches = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!matches) throw invalidCredentials();

    await this.users.replacePassword(user.id, await this.passwords.hash(newPassword));
    await this.sessions.revokeAllForUser(
      user.id,
      SessionRevocation.PASSWORD_CHANGED,
      auth.sessionId,
    );
  }
}
