import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import {
  cursorQuerySchema,
  routes,
  type CursorQuery,
  type Session as SessionView,
} from '@reliance/contracts';

import { type PageResult } from '../../common/pagination/cursor.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { SessionsService } from './sessions.service.js';

/**
 * "Where am I signed in?" — the session list and remote sign-out.
 *
 * Every revoking route spares the session making the request: signing the customer out of
 * the device they are asking from would make the button unusable, and logout already
 * exists for that.
 */
@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** The customer's live sessions, newest first, with the current one flagged. */
  @Get(routes.devices.sessions)
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(cursorQuerySchema)) page: CursorQuery,
  ): Promise<PageResult<SessionView>> {
    return this.sessions.list(user.userId, user.sessionId, page);
  }

  /** Signs out every other session — the response to "I think someone else is in my account". */
  @Post(routes.devices.revokeAllSessions)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async revokeAll(@CurrentUser() user: AuthenticatedUser): Promise<null> {
    await this.sessions.revokeAllOthers(user.userId, user.sessionId);
    return null;
  }

  /** Signs out one other session — "that isn't my laptop". */
  @Delete(routes.devices.session(':id'))
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ): Promise<null> {
    await this.sessions.revoke(user.userId, sessionId, user.sessionId);
    return null;
  }
}
