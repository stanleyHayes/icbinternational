import { Injectable } from '@nestjs/common';

import { type RegisterRequest, type User as UserView } from '@reliance/contracts';

import { AppConfigService } from '../../config/config.service.js';

import { AuthTokenKind } from './auth.constants.js';
import { EmailTokenService } from './email-token.service.js';
import { PasswordService } from './password.service.js';
import { toUserView, UsersService } from './users/index.js';

/**
 * Opening an account: registration and email confirmation.
 *
 * Registration creates the identity in `PENDING_VERIFICATION` and sends the confirmation
 * link — it deliberately does *not* start a session. Whoever controls the address must
 * click first; otherwise a typo'd address would hand a stranger a logged-in account under
 * someone else's email.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly emailTokens: EmailTokenService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Creates the identity and emails the verification link.
   *
   * @throws {AppError} `EMAIL_ALREADY_REGISTERED` / `PHONE_ALREADY_REGISTERED` from the
   *   unique-index guard in `UsersService`.
   */
  async register(input: RegisterRequest): Promise<UserView> {
    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.users.createCustomer({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      ...(input.phone ? { phone: input.phone } : {}),
      segment: input.segment,
      locale: input.locale,
      baseCurrency: this.config.bank.baseCurrency,
      marketingOptIn: input.marketingOptIn,
    });

    await this.emailTokens.sendVerification(user);
    return toUserView(user);
  }

  /**
   * Confirms the address and activates the account.
   *
   * Idempotent at the user level: a mail client that pre-fetches the link and a customer
   * who then clicks it both succeed, because `markEmailVerified` converges to the same
   * state. Only the *token* is single-use.
   *
   * @throws {AppError} `TOKEN_INVALID` for a spent, expired or unknown link.
   */
  async verifyEmail(token: string): Promise<UserView> {
    const record = await this.emailTokens.redeem(token, AuthTokenKind.EMAIL_VERIFICATION);
    const user = await this.users.markEmailVerified(record.userId);
    return toUserView(user);
  }
}
