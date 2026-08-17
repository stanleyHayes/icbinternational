import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ErrorCode, type ChatStreamToken } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/config.service.js';
import { randomToken } from '../auth/support/tokens.js';

import { CHAT_WS_TOKEN_TTL_SECONDS } from './chat.constants.js';

const MILLISECONDS_PER_SECOND = 1000;

/** 128 bits of `jti`. Enough to name one token uniquely in an audit trail forever. */
const JTI_BYTES = 16;

const EXPIRED_ERROR_NAME = 'TokenExpiredError';

/** Purpose claim, checked on every verification — never just decoded. */
const CHAT_TOKEN_PURPOSE = 'chat';

/**
 * Who a stream token entitles to listen.
 *
 * The scope *is* the authorisation. A customer scope hears one customer's
 * conversations, a guest scope hears exactly one conversation, and an agent scope hears
 * the whole inbox. The token is five minutes short-lived and the socket it opens is
 * receive-only, so a stolen one reads what its holder was already entitled to read and
 * nothing more — but it still names its scope, so the stream service never has to trust
 * a claim it did not verify.
 */
export type ChatStreamScope =
  | { readonly kind: 'customer'; readonly userId: string; readonly sessionId: string }
  | { readonly kind: 'agent'; readonly adminId: string }
  | { readonly kind: 'guest'; readonly conversationId: string };

interface ChatStreamClaims {
  readonly typ: string;
  readonly sco: ChatStreamScope;
  readonly iat: number;
  readonly exp: number;
}

/**
 * Mints and verifies the short-lived tokens that authorise a chat stream connection.
 *
 * Mirrors the customer `TokenService`'s two load-bearing choices. Timing claims are
 * computed from `ClockService`, never the wall clock: the bank's clock can be advanced
 * by the operations console, and a token minted against real time would appear expired
 * the moment it moved. And the `typ` claim is checked on every verification: a
 * signature proves the server issued a token, not that it issued it for the chat
 * stream.
 *
 * Signed with the access secret rather than one of its own: the token never crosses a
 * trust boundary the access token does not already cross, and a third secret to rotate
 * is a third secret to leak.
 */
@Injectable()
export class ChatWsTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {}

  /** A customer scope, minted behind `JwtAuthGuard` — the session was live to get here. */
  async mintForCustomer(input: { userId: string; sessionId: string }): Promise<ChatStreamToken> {
    return this.mint({ kind: 'customer', userId: input.userId, sessionId: input.sessionId });
  }

  /** An agent scope, minted behind the admin guard chain. */
  async mintForAgent(adminId: string): Promise<ChatStreamToken> {
    return this.mint({ kind: 'agent', adminId });
  }

  /**
   * A guest scope, minted when the conversation is created.
   *
   * There is no session to re-check and no cookie to carry: this token *is* the guest's
   * credential, for the stream and for the reply routes alike, scoped to the one
   * conversation it was issued with.
   */
  async mintForGuest(conversationId: string): Promise<ChatStreamToken> {
    return this.mint({ kind: 'guest', conversationId });
  }

  /**
   * Verifies signature, expiry and purpose, and returns the scope the token carries.
   *
   * @throws {AppError} `TOKEN_EXPIRED` past `exp`; `TOKEN_INVALID` for a bad signature,
   *   a wrong purpose, or a scope that does not parse.
   */
  async verify(token: string): Promise<ChatStreamScope> {
    let claims: ChatStreamClaims;
    try {
      claims = await this.jwt.verifyAsync<ChatStreamClaims>(token, {
        secret: this.config.jwt.accessSecret,
        clockTimestamp: Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND),
      });
    } catch (error) {
      throw new AppError({
        code: isExpiry(error) ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID,
        message: isExpiry(error) ? 'That token has expired.' : 'That token is not valid.',
        cause: error,
      });
    }

    if (claims.typ !== CHAT_TOKEN_PURPOSE || !isScope(claims.sco)) {
      throw new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: 'This token cannot be used here.',
        context: { expected: CHAT_TOKEN_PURPOSE, actual: claims.typ },
      });
    }

    return claims.sco;
  }

  private async mint(scope: ChatStreamScope): Promise<ChatStreamToken> {
    const issuedAt = Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND);

    const token = await this.jwt.signAsync(
      {
        typ: CHAT_TOKEN_PURPOSE,
        sco: scope,
        jti: randomToken(JTI_BYTES),
        iat: issuedAt,
        exp: issuedAt + CHAT_WS_TOKEN_TTL_SECONDS,
      },
      { secret: this.config.jwt.accessSecret },
    );

    return { token, expiresAt: this.clock.inSeconds(CHAT_WS_TOKEN_TTL_SECONDS).toISOString() };
  }
}

/** Structural check: a well-signed token with a nonsense scope is still refused. */
function isScope(value: unknown): value is ChatStreamScope {
  if (typeof value !== 'object' || value === null) return false;
  const scope = value as Record<string, unknown>;
  switch (scope['kind']) {
    case 'customer':
      return typeof scope['userId'] === 'string' && typeof scope['sessionId'] === 'string';
    case 'agent':
      return typeof scope['adminId'] === 'string';
    case 'guest':
      return typeof scope['conversationId'] === 'string';
    default:
      return false;
  }
}

/** `jsonwebtoken` distinguishes expiry from every other failure only by the error name. */
function isExpiry(error: unknown): boolean {
  return error instanceof Error && error.name === EXPIRED_ERROR_NAME;
}
