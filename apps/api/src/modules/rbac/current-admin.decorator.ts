import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { type AdminPrincipal, type AdminRequest } from './admin-auth.types.js';

/**
 * Parameter decorator yielding the authenticated admin's principal.
 *
 * Only defined behind `AdminAuthGuard`; a controller that forgets the guard gets
 * `undefined`, which is why every shipped admin controller should prefer the
 * `AdminEndpoint` composite — it applies the whole chain in one decorator.
 */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminPrincipal | undefined =>
    context.switchToHttp().getRequest<AdminRequest>().adminUser,
);
