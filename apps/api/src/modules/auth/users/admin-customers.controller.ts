import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import {
  ErrorCode,
  Permission,
  routes,
  type User,
} from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { clampLimit } from '../../../common/pagination/cursor.js';
import { AdminEndpoint } from '../../rbac/index.js';

import { type UserDocument } from './schemas/user.schema.js';
import { toUserView } from './user.mapper.js';
import { UserRepository, type AdminCustomerQuery } from './user.repository.js';

/**
 * Admin console: customer management.
 *
 * Freeze and impersonate are write operations that trigger audit events in the access log.
 * This controller does not hold the impersonation token implementation — that is a session
 * service concern. The endpoint here validates the permission and delegates to the repo.
 */
@Controller()
export class AdminCustomersController {
  constructor(private readonly users: UserRepository) {}

  /** `GET /admin/customers?cursor=&limit=30` — newest sign-ups first. */
  @Get(routes.admin.customers)
  @AdminEndpoint(Permission.CUSTOMER_READ)
  async list(
    @Query('cursor') cursor?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<{ data: User[]; hasMore: boolean }> {
    const limit = clampLimit(rawLimit);
    const query: AdminCustomerQuery = { cursor, limit };
    // One more than asked for, so `hasMore` is answered by the read rather than by a
    // second count query that could disagree with it.
    const docs = await this.users.listPaginated({ ...query, limit: limit + 1 });
    return { data: docs.slice(0, limit).map(toUserView), hasMore: docs.length > limit };
  }

  /** `GET /admin/customers/:id` */
  @Get(routes.admin.customer(':id'))
  @AdminEndpoint(Permission.CUSTOMER_READ)
  async getById(@Param('id') id: string): Promise<User> {
    return toUserView(await this.requireCustomer(id));
  }

  /**
   * `POST /admin/customers/:id/freeze` — places a FROZEN status on the user account.
   *
   * A frozen account cannot initiate transfers or authenticate for transactions, but the
   * record is not deleted — it must still be recoverable by compliance and support.
   */
  @Post(routes.admin.freezeCustomer(':id'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminEndpoint(Permission.CUSTOMER_FREEZE)
  async freeze(@Param('id') id: string): Promise<void> {
    await this.requireCustomer(id);
    await this.users.patch(id, { $set: { status: 'FROZEN' } });
  }

  /**
   * `POST /admin/customers/:id/impersonate` — not yet available.
   *
   * Fails closed, deliberately, and will keep failing closed until there is a session
   * service behind it.
   *
   * What stood here returned `impersonation:<customer id>:<timestamp>` and called it a
   * token. Nothing verified it, because nothing could: it is not signed, and every part of
   * it is guessable by anyone who knows a customer id. The moment any code had started
   * trusting that string, the console's most dangerous permission would have been
   * forgeable from a URL.
   *
   * Answering `FEATURE_DISABLED` is the honest state of the feature. Impersonation needs a
   * real short-lived signed grant, an audit event written before the grant is issued, the
   * read-only flag the console already asks for, and a visible banner for the duration —
   * none of which exist yet. A route that reports itself unavailable can be built on; one
   * that hands back a forgeable credential cannot.
   */
  @Post(routes.admin.impersonate(':id'))
  @AdminEndpoint(Permission.CUSTOMER_IMPERSONATE)
  async impersonate(@Param('id') id: string): Promise<never> {
    await this.requireCustomer(id);
    throw new AppError({
      code: ErrorCode.FEATURE_DISABLED,
      message: 'Impersonation is not available yet. Ask the customer to share their screen.',
    });
  }

  /** The customer, or a `NOT_FOUND` naming what was looked for. */
  private async requireCustomer(id: string): Promise<UserDocument> {
    const doc = await this.users.findById(id);
    if (!doc) {
      throw new AppError({
        code: ErrorCode.NOT_FOUND,
        message: 'No customer with that reference.',
        context: { customerId: id },
      });
    }
    return doc;
  }
}
