import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  closeAccountRequestSchema,
  listAccountsQuerySchema,
  openAccountRequestSchema,
  routes,
  updateAccountRequestSchema,
  type Account,
  type Balance,
  type CloseAccountRequest,
  type ListAccountsQuery,
  type NetWorth,
  type OpenAccountRequest,
  type UpdateAccountRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { AccountClosureService } from './account-closure.service.js';
import { AccountOpeningService } from './account-opening.service.js';
import { AccountService } from './account.service.js';
import { NetWorthService } from './net-worth.service.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/**
 * The customer's own accounts.
 *
 * Every handler takes the caller's id from the verified token and passes it into the
 * service, which resolves the account *through* that id rather than checking ownership
 * afterwards. There is no code path here that can read an account by id alone, which is
 * what makes an IDOR attempt structurally impossible rather than merely guarded — and
 * why the attempt answers `ACCOUNT_NOT_FOUND` instead of `FORBIDDEN`, since a 403 would
 * confirm that the id belongs to somebody.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(
    private readonly accounts: AccountService,
    private readonly opening: AccountOpeningService,
    private readonly closure: AccountClosureService,
    private readonly netWorth: NetWorthService,
  ) {}

  @Get(routes.accounts.list)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listAccountsQuerySchema)) query: ListAccountsQuery,
  ): Promise<Account[]> {
    return this.accounts.list(user.userId, query);
  }

  @Post(routes.accounts.create)
  @HttpCode(HttpStatus.CREATED)
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(openAccountRequestSchema)) request: OpenAccountRequest,
  ): Promise<Account> {
    return this.opening.open({ userId: user.userId, request });
  }

  /**
   * Declared before `byId`, and it has to be.
   *
   * Nest matches routes in declaration order, so `/accounts/net-worth` registered after
   * `/accounts/:id` would be swallowed by it and answered with "no such account".
   */
  @Get(routes.accounts.netWorth)
  async worth(@CurrentUser() user: AuthenticatedUser): Promise<NetWorth> {
    return this.netWorth.forUser(user.userId);
  }

  @Get(routes.accounts.byId(`:${ID_PARAM}`))
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) accountId: string,
  ): Promise<Account> {
    return this.accounts.get(user.userId, accountId);
  }

  @Patch(routes.accounts.byId(`:${ID_PARAM}`))
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) accountId: string,
    @Body(zodBody(updateAccountRequestSchema)) request: UpdateAccountRequest,
  ): Promise<Account> {
    return this.accounts.update(user.userId, accountId, request);
  }

  @Get(routes.accounts.balance(`:${ID_PARAM}`))
  async balance(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) accountId: string,
  ): Promise<Balance> {
    return this.accounts.balance(user.userId, accountId);
  }

  @Post(routes.accounts.close(`:${ID_PARAM}`))
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) accountId: string,
    @Body(zodBody(closeAccountRequestSchema)) request: CloseAccountRequest,
  ): Promise<Account> {
    return this.closure.close({ userId: user.userId, accountId, request });
  }
}
