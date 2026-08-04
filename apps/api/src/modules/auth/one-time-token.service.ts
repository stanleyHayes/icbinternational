import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';

import { AuthTokenRepository } from './auth-token.repository.js';
import {
  AuthTokenKind,
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
} from './auth.constants.js';
import { emailLinkInvalid } from './auth.errors.js';
import { type AuthTokenDocument } from './schemas/auth-token.schema.js';
import { randomToken, sha256Hex } from './support/tokens.js';

const TTL_SECONDS: Record<AuthTokenKind, number> = {
  [AuthTokenKind.EMAIL_VERIFICATION]: EMAIL_VERIFICATION_TTL_SECONDS,
  [AuthTokenKind.PASSWORD_RESET]: PASSWORD_RESET_TTL_SECONDS,
};

/**
 * Single-use emailed secrets: verification and password-reset links.
 *
 * The raw token exists unhashed for exactly one moment — the return from {@link issue} —
 * and afterwards only its SHA-256 is on record. Issuing a fresh link quietly disarms every
 * previous one of the same kind, so a mailbox of old links is not a stockpile of live
 * credentials.
 */
@Injectable()
export class OneTimeTokenService {
  constructor(
    private readonly tokens: AuthTokenRepository,
    private readonly clock: ClockService,
  ) {}

  /**
   * Mints a token of the given kind for a user, disarming any still outstanding.
   *
   * @returns the raw token to embed in the email link — never stored, never logged.
   */
  async issue(userId: string, kind: AuthTokenKind): Promise<string> {
    const token = randomToken();
    const now = this.clock.now();

    await this.tokens.consumeAllForUser(userId, kind, now);
    await this.tokens.create({
      userId,
      kind,
      tokenHash: sha256Hex(token),
      expiresAt: this.clock.inSeconds(TTL_SECONDS[kind]),
      consumedAt: null,
    });

    return token;
  }

  /**
   * Redeems a token, atomically spending it.
   *
   * @throws {AppError} `TOKEN_INVALID` when the link is unknown, expired or already used.
   *   The three cases share one answer on purpose: distinguishing them tells a prober
   *   which guesses were close.
   */
  async redeem(token: string, kind: AuthTokenKind): Promise<AuthTokenDocument> {
    const record = await this.tokens.consume(sha256Hex(token), kind, this.clock.now());
    if (!record) throw emailLinkInvalid();
    return record;
  }

  /** Disarms every outstanding token of a kind — after a successful redemption. */
  async revokeAllForUser(userId: string, kind: AuthTokenKind): Promise<void> {
    await this.tokens.consumeAllForUser(userId, kind, this.clock.now());
  }
}
