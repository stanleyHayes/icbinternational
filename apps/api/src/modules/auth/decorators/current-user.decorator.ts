import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { unauthenticated } from '../auth.errors.js';
import { type AuthenticatedRequest, type AuthenticatedUser } from '../auth.types.js';

/**
 * Injects the identity `JwtAuthGuard` established for this request.
 *
 * ```ts
 * @Get('me')
 * @UseGuards(JwtAuthGuard)
 * me(@CurrentUser() user: AuthenticatedUser) { ... }
 * ```
 *
 * Only meaningful behind the guard; used without one it throws rather than handing the
 * handler an `undefined` to trip over later.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw unauthenticated();
    return request.user;
  },
);
