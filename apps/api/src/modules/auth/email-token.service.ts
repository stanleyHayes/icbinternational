import { Inject, Injectable } from '@nestjs/common';

import { AuthTokenKind } from './auth.constants.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { AUTH_EMAIL_PORT, type AuthEmailPort } from './ports/auth-email.port.js';
import { type AuthTokenDocument } from './schemas/auth-token.schema.js';
import { UserRepository, type UserDocument } from './users/index.js';

/**
 * The email-bound token flows: verification and password-reset links.
 *
 * Every "email us to prove it's you" path answers the same way whether or not the address
 * is registered — silence. A response that differed would turn the endpoint into a list
 * of who banks here, queryable one address at a time.
 */
@Injectable()
export class EmailTokenService {
  constructor(
    private readonly oneTimeTokens: OneTimeTokenService,
    private readonly users: UserRepository,
    @Inject(AUTH_EMAIL_PORT) private readonly email: AuthEmailPort,
  ) {}

  /** Issues a verification link and sends it. Called at registration and on resend. */
  async sendVerification(user: UserDocument): Promise<void> {
    const token = await this.oneTimeTokens.issue(user.id, AuthTokenKind.EMAIL_VERIFICATION);
    await this.email.sendVerificationEmail({ to: user.email, firstName: user.firstName, token });
  }

  /**
   * Re-sends a verification link, silently when there is nothing to send.
   *
   * Unknown address, already verified — same empty success. Only an address still waiting
   * for confirmation gets mail.
   */
  async requestVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.emailVerified) return;
    await this.sendVerification(user);
  }

  /** Sends a reset link, silently when the address is unknown. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    const token = await this.oneTimeTokens.issue(user.id, AuthTokenKind.PASSWORD_RESET);
    await this.email.sendPasswordResetEmail({ to: user.email, firstName: user.firstName, token });
  }

  /** Redeems an emailed token. See {@link OneTimeTokenService.redeem}. */
  async redeem(token: string, kind: AuthTokenKind): Promise<AuthTokenDocument> {
    return this.oneTimeTokens.redeem(token, kind);
  }

  /** Disarms every outstanding token of a kind for a user. */
  async revokeAllForUser(userId: string, kind: AuthTokenKind): Promise<void> {
    await this.oneTimeTokens.revokeAllForUser(userId, kind);
  }
}
