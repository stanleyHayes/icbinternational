import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';

import { SessionRevocation } from './auth.constants.js';
import { sessionSignedOut, sessionUnknown } from './auth.errors.js';
import { type RequestOrigin } from './auth.types.js';
import { type SessionDocument } from './schemas/session.schema.js';
import { SessionRepository } from './session.repository.js';
import { sha256Hex } from './support/tokens.js';
import { TokenService } from './token.service.js';

/** A freshly minted session row plus the token pair that proves it. */
export interface SessionBundle {
  session: SessionDocument;
  accessToken: string;
  refreshToken: string;
}

/** Fields needed to persist one session row. */
interface SessionRowInput {
  id: string;
  userId: string;
  family: string;
  refreshToken: string;
  deviceId: string | null;
  origin: RequestOrigin;
}

/**
 * Refresh-token sessions: creation, rotation and revocation.
 *
 * Rotation is where the security lives. Every refresh spends the presented token and
 * mints a successor, so a legitimate client holds exactly one live token at any moment.
 * Presenting a token whose row is already spent therefore *proves* a copy exists, and the
 * only safe response is to revoke the whole family — the server cannot tell thief from
 * victim, so both are signed out and must log in again.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /** Starts a new login family: one row, one refresh token, one access token. */
  async create(
    userId: string,
    deviceId: string | null,
    origin: RequestOrigin,
  ): Promise<SessionBundle> {
    const sessionId = this.ids.generate('session');
    const refreshToken = await this.tokens.signRefresh({ userId, sessionId, family: sessionId });
    const session = await this.sessions.create(
      this.row({ id: sessionId, userId, family: sessionId, refreshToken, deviceId, origin }),
    );

    return {
      session,
      accessToken: await this.signAccess(userId, sessionId, deviceId),
      refreshToken,
    };
  }

  /**
   * Exchanges a refresh token for a new pair, spending the old one.
   *
   * @throws {AppError} `TOKEN_INVALID` for an unknown or signed-out token, `TOKEN_EXPIRED`
   *   for one past its lifetime, and `TOKEN_REUSE_DETECTED` — with the whole family
   *   revoked — for a token that was already spent.
   */
  async rotate(refreshToken: string, origin: RequestOrigin): Promise<SessionBundle> {
    await this.tokens.verifyRefresh(refreshToken);
    const hash = sha256Hex(refreshToken);

    const current = await this.sessions.findByTokenHash(hash);
    if (!current) throw sessionUnknown();
    if (current.rotatedAt !== null) return this.rejectReuse(current);
    if (current.revokedAt !== null) throw sessionSignedOut();
    if (current.expiresAt.getTime() <= this.clock.timestamp()) throw this.sessionExpired();

    const claimed = await this.sessions.claimForRotation(hash, this.clock.now());
    if (!claimed) return this.rejectReuse(current);

    return this.succeed(claimed, origin);
  }

  /** Ends one session — logout, or remote revocation of a single device. */
  async revoke(sessionId: string, reason: SessionRevocation): Promise<void> {
    await this.sessions.revokeSession(sessionId, reason, this.clock.now());
  }

  /**
   * True while the row is the live tip of its chain: not spent, not revoked, not expired.
   *
   * `JwtAuthGuard` asks this on every request. An access token is a bearer credential
   * with fifteen minutes of life, and without this check a logout, a password change or a
   * family revocation would leave it working for all fifteen of them.
   */
  async isLive(sessionId: string): Promise<boolean> {
    const row = await this.sessions.findById(sessionId);
    if (!row || row.revokedAt !== null || row.rotatedAt !== null) return false;
    return row.expiresAt.getTime() > this.clock.timestamp();
  }

  /** Ends every session a user holds, optionally sparing the one that just proved itself. */
  async revokeAllForUser(
    userId: string,
    reason: SessionRevocation,
    exceptSessionId?: string,
  ): Promise<void> {
    await this.sessions.revokeAllForUser(userId, reason, this.clock.now(), exceptSessionId);
  }

  /**
   * The response to a spent token being presented again: burn the whole family.
   *
   * A rotated token in a second hand means the token was copied — the honest client
   * discarded it the moment the successor arrived. Revoking the family signs out both
   * parties, which is the only outcome that certainly includes the thief.
   */
  private async rejectReuse(row: SessionDocument): Promise<never> {
    const revoked = await this.sessions.revokeFamily(
      row.family,
      SessionRevocation.REUSE_DETECTED,
      this.clock.now(),
    );
    this.logger.warn(
      `Refresh-token reuse detected for user ${row.userId} — revoked family ${row.family} (${revoked} sessions)`,
    );

    throw new AppError({
      code: ErrorCode.TOKEN_REUSE_DETECTED,
      message:
        'That sign-in session was used after it was replaced. Every session from that login has been signed out.',
    });
  }

  /** Mints the successor row and links the spent one to it. */
  private async succeed(parent: SessionDocument, origin: RequestOrigin): Promise<SessionBundle> {
    const sessionId = this.ids.generate('session');
    const refreshToken = await this.tokens.signRefresh({
      userId: parent.userId,
      sessionId,
      family: parent.family,
    });

    const session = await this.sessions.create(
      this.row({
        id: sessionId,
        userId: parent.userId,
        family: parent.family,
        refreshToken,
        deviceId: parent.deviceId,
        origin,
      }),
    );
    await this.sessions.markReplaced(parent.id, sessionId);

    return {
      session,
      accessToken: await this.signAccess(parent.userId, sessionId, parent.deviceId),
      refreshToken,
    };
  }

  private signAccess(userId: string, sessionId: string, deviceId: string | null): Promise<string> {
    return this.tokens.signAccess({ userId, sessionId, deviceId });
  }

  private row(input: SessionRowInput): Record<string, unknown> {
    const now = this.clock.now();
    return {
      id: input.id,
      userId: input.userId,
      family: input.family,
      refreshTokenHash: sha256Hex(input.refreshToken),
      deviceId: input.deviceId,
      ip: input.origin.ip,
      userAgent: input.origin.userAgent,
      rotatedAt: null,
      replacedBySessionId: null,
      revokedAt: null,
      revokedReason: null,
      expiresAt: this.clock.inSeconds(this.tokens.refreshTtlSeconds),
      lastSeenAt: now,
    };
  }

  private sessionExpired(): AppError {
    return new AppError({
      code: ErrorCode.TOKEN_EXPIRED,
      message: 'That session has expired. Sign in again.',
    });
  }
}
