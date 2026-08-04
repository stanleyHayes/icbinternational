/**
 * A customer's term deposits.
 *
 * `/deposits/rates` is declared before `/deposits/:id`, because Nest matches in
 * declaration order and the rate board would otherwise be read as a request for a deposit
 * called "rates". The board is the only handler here that is not scoped to a customer —
 * everything else resolves through the caller's id.
 *
 * **Every route that moves money carries `@Idempotent()` and `@Audited()`.** A network
 * timeout tells the client nothing about whether the server acted, and a client that
 * retries a placement without replay protection puts the customer's savings on deposit
 * twice; one that refuses to retry strands them in an unknown state. The trail matters for
 * the same reason it does on a payment — a deposit is where a customer's money went, and a
 * trail that has to be remembered per-endpoint is a trail with holes in it.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  createDepositRequestSchema,
  routes,
  type BreakDepositQuote,
  type CreateDepositRequest,
  type Deposit,
  type DepositRate,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { DepositService } from './deposit.service.js';
import { setAutoRolloverRequestSchema, type SetAutoRolloverRequest } from './deposits.dto.js';

const ID_PARAM = 'id';
const DEPOSIT_ROUTE = routes.save.deposit(`:${ID_PARAM}`);
const ROLLOVER_ROUTE = `${DEPOSIT_ROUTE}/auto-rollover`;

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'deposit';

/** The route parameter carrying the deposit id, for the audit interceptor. */
const AUDIT_ID_FROM = `params.${ID_PARAM}`;

@Controller()
@UseGuards(JwtAuthGuard)
export class DepositsController {
  constructor(private readonly deposits: DepositService) {}

  /** The published rate board, by tenor. */
  @Get(routes.save.depositRates)
  rates(): readonly DepositRate[] {
    return this.deposits.rates();
  }

  @Get(routes.save.deposits)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<Deposit[]> {
    return this.deposits.list(user.userId);
  }

  /** Places a deposit, moving the money out of the source account immediately. */
  @Post(routes.save.deposits)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'deposit.place', entity: AUDIT_ENTITY })
  async place(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createDepositRequestSchema)) request: CreateDepositRequest,
  ): Promise<Deposit> {
    return this.deposits.place(user.userId, request);
  }

  @Get(DEPOSIT_ROUTE)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) depositId: string,
  ): Promise<Deposit> {
    return this.deposits.get(user.userId, depositId);
  }

  /** What breaking this deposit today would produce. Asking costs nothing. */
  @Get(routes.save.breakQuote(`:${ID_PARAM}`))
  async breakQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) depositId: string,
  ): Promise<BreakDepositQuote> {
    return this.deposits.breakQuote(user.userId, depositId);
  }

  /** Closes a deposit before its term ends, at the reduced rate. */
  @Post(routes.save.break(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audited({ action: 'deposit.break', entity: AUDIT_ENTITY, entityIdFrom: AUDIT_ID_FROM })
  async breakEarly(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) depositId: string,
  ): Promise<Deposit> {
    return this.deposits.breakEarly(user.userId, depositId);
  }

  /**
   * Turns automatic renewal on or off before maturity.
   *
   * Audited but not `@Idempotent()`: setting a flag to the value it already holds is
   * already a no-op, so replay protection would buy nothing. It moves no money today, but
   * it decides whether the principal is renewed or paid out when the term ends, which is
   * exactly the kind of instruction a customer later says they never gave.
   */
  @Put(ROLLOVER_ROUTE)
  @Audited({ action: 'deposit.autoRollover', entity: AUDIT_ENTITY, entityIdFrom: AUDIT_ID_FROM })
  async autoRollover(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) depositId: string,
    @Body(zodBody(setAutoRolloverRequestSchema)) request: SetAutoRolloverRequest,
  ): Promise<Deposit> {
    return this.deposits.setAutoRollover({
      userId: user.userId,
      depositId,
      autoRollover: request.autoRollover,
    });
  }
}
