import { Injectable } from '@nestjs/common';

import { ErrorCode, type CursorQuery, type Session as SessionView } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { SessionRevocation } from '../auth/auth.constants.js';
import { type SessionDocument } from '../auth/schemas/session.schema.js';
import { SessionService } from '../auth/session.service.js';

import { SessionViewRepository } from './session-view.repository.js';
import { toSessionView } from './session.mapper.js';

/**
 * The customer's view of their own sign-in sessions: list, remote revoke, revoke-all.
 *
 * Revocation itself is delegated to the auth module's `SessionService` — it owns the
 * session lifecycle, and a second writer to those rows is how reuse detection would
 * break. This service owns the two things that are genuinely its own: which sessions a
 * customer may see, and which ones they may kill (their own, except the one in use).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly views: SessionViewRepository,
    private readonly sessions: SessionService,
  ) {}

  /** Live sessions as a cursor page, newest first, flagging the one making the request. */
  async list(
    userId: string,
    currentSessionId: string,
    page: CursorQuery,
  ): Promise<PageResult<SessionView>> {
    const rows = await this.views.findLiveForUser(userId);
    const after = page.cursor ? decodeCursor(page.cursor) : null;
    const visible = after ? rows.slice(indexAfter(rows, after.id)) : rows;

    return buildPage({
      records: visible.map((row) => toSessionView(row, currentSessionId)),
      limit: page.limit,
      toCursor: (view) => ({ sortValue: view.createdAt, id: view.id }),
      total: rows.length,
    });
  }

  /**
   * Ends one of the customer's other sessions — the "sign out that laptop" button.
   *
   * @throws {AppError} `NOT_FOUND` for an unknown, ended or foreign session — one answer
   *   for all three, so probing ids cannot map someone else's account; and
   *   `PRECONDITION_FAILED` when the target is the session making the request, because
   *   the honest way to end that one is logout.
   */
  async revoke(userId: string, sessionId: string, currentSessionId: string): Promise<void> {
    const target = await this.views.findLiveById(sessionId);
    if (!target || target.userId !== userId) throw AppError.notFound('Session', sessionId);

    if (target.id === currentSessionId) {
      throw new AppError({
        code: ErrorCode.PRECONDITION_FAILED,
        message: 'You cannot revoke the session you are using. Sign out instead.',
      });
    }

    await this.sessions.revoke(target.id, SessionRevocation.REMOTE_REVOKE);
  }

  /** Ends every session except the one making the request. */
  async revokeAllOthers(userId: string, currentSessionId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId, SessionRevocation.REMOTE_REVOKE, currentSessionId);
  }

  /** Ends every live session running on a device the customer has just removed. */
  async revokeForDevice(userId: string, deviceId: string): Promise<void> {
    const rows = await this.views.findLiveForDevice(userId, deviceId);
    for (const row of rows) {
      await this.sessions.revoke(row.id, SessionRevocation.REMOTE_REVOKE);
    }
  }
}

/** Position just past the record the cursor names, or the start when it is stale. */
function indexAfter(rows: readonly SessionDocument[], id: string): number {
  const index = rows.findIndex((row) => row.id === id);
  return index === -1 ? 0 : index + 1;
}
