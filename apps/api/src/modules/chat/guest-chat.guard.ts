import {
  createParamDecorator,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { type Request } from 'express';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { ChatWsTokenService, type ChatStreamScope } from './chat-ws-token.service.js';

const BEARER_PREFIX = 'bearer ';

/** The guest scope a verified chat token carries, narrowed by the guard. */
export type GuestChatScope = Extract<ChatStreamScope, { kind: 'guest' }>;

/** An Express request that has passed `GuestChatGuard`. */
export interface GuestChatRequest extends Request {
  guestChat?: GuestChatScope;
}

/**
 * Authenticates a public chat route by its guest stream token.
 *
 * The same short-lived token that opens the WebSocket authorises the guest's reads and
 * replies over REST: a guest has no session, no cookie and no CSRF token, so the bearer
 * token is the whole credential. It is scoped to exactly one conversation at mint time,
 * which is why this guard attaches the scope for the controller to compare against the
 * route — the token itself can never name a second conversation.
 */
@Injectable()
export class GuestChatGuard implements CanActivate {
  constructor(private readonly tokens: ChatWsTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuestChatRequest>();

    const header = request.headers.authorization;
    const token =
      header?.toLowerCase().startsWith(BEARER_PREFIX) === true
        ? header.slice(BEARER_PREFIX.length)
        : undefined;
    if (!token) {
      throw new AppError({
        code: ErrorCode.UNAUTHENTICATED,
        message: 'A chat session token is required.',
      });
    }

    const scope = await this.tokens.verify(token);
    if (scope.kind !== 'guest') {
      throw AppError.forbidden('This token cannot be used on the public chat routes.');
    }

    request.guestChat = scope;
    return true;
  }
}

/**
 * Injects the guest scope `GuestChatGuard` established for this request.
 *
 * Only meaningful behind the guard; used without one it throws rather than handing the
 * handler an `undefined` to trip over later.
 */
export const GuestChat = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GuestChatScope => {
    const scope = context.switchToHttp().getRequest<GuestChatRequest>().guestChat;
    if (!scope) {
      throw new AppError({ code: ErrorCode.UNAUTHENTICATED, message: 'Authentication required.' });
    }
    return scope;
  },
);
