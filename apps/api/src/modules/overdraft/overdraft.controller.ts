/**
 * A customer's overdraft.
 *
 * Every handler resolves the account through the caller's id before it looks at the
 * facility, so a request for somebody else's overdraft fails on the account and never
 * reaches the facility at all.
 *
 * **The routes that change what a customer may spend carry `@Idempotent()` and
 * `@Audited()`.** Granting a facility and closing one both write the account's
 * `overdraftLimit`, which is spendable money; a client that retries a timed-out request
 * without replay protection asks the bank for a second facility, and a credit decision
 * with no trail is one the bank cannot explain to the customer or to a regulator.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { routes } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import {
  requestOverdraftRequestSchema,
  updateSweepRequestSchema,
  type OverdraftFacility,
  type RequestOverdraftRequest,
  type UpdateSweepRequest,
} from './overdraft.dto.js';
import { OverdraftService } from './overdraft.service.js';

const ACCOUNT_PARAM = 'accountId';

/**
 * The contract's route map names only `POST /overdraft/request`.
 *
 * The read, the sweep setting and the closure are derived from it so the four paths cannot
 * drift apart, and are proposed as contract additions in `docs/CONTRACT_CHANGES.md`.
 */
const OVERDRAFT_ROOT = '/overdraft';
const FACILITY_ROUTE = `${OVERDRAFT_ROOT}/:${ACCOUNT_PARAM}`;
const SWEEP_ROUTE = `${FACILITY_ROUTE}/sweep`;

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'overdraft';

/**
 * The route parameter carrying the subject's id.
 *
 * An account id rather than a facility id, deliberately: it is what the customer's request
 * actually names, and a facility is identified by the account it attaches to.
 */
const AUDIT_ID_FROM = `params.${ACCOUNT_PARAM}`;

@Controller()
@UseGuards(JwtAuthGuard)
export class OverdraftController {
  constructor(private readonly overdrafts: OverdraftService) {}

  /**
   * Requests a facility, decided immediately.
   *
   * A granted facility appears in the account's available balance on the next read, which
   * is the only place an overdraft is ever visible as spendable money.
   */
  @Post(routes.borrow.requestOverdraft)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'overdraft.request', entity: AUDIT_ENTITY })
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(requestOverdraftRequestSchema)) request: RequestOverdraftRequest,
  ): Promise<OverdraftFacility> {
    return this.overdrafts.request(user.userId, request);
  }

  /** The facility on an account, priced against today's balance. */
  @Get(FACILITY_ROUTE)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ACCOUNT_PARAM) accountId: string,
  ): Promise<OverdraftFacility> {
    return this.overdrafts.forAccount(user.userId, accountId);
  }

  /**
   * Nominates, or clears, the account the sweep may draw on to repay the overdraft.
   *
   * Audited but not `@Idempotent()`: setting the nomination to the value it already holds
   * is already a no-op. It is still an instruction to move money between the customer's
   * accounts without asking again, which is exactly the kind they later query.
   */
  @Put(SWEEP_ROUTE)
  @Audited({ action: 'overdraft.sweep.set', entity: AUDIT_ENTITY, entityIdFrom: AUDIT_ID_FROM })
  async setSweep(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ACCOUNT_PARAM) accountId: string,
    @Body(zodBody(updateSweepRequestSchema)) request: UpdateSweepRequest,
  ): Promise<OverdraftFacility> {
    return this.overdrafts.setSweepAccount({
      userId: user.userId,
      accountId,
      sweepFromAccountId: request.sweepFromAccountId,
    });
  }

  /** Closes a facility that is no longer in use, taking the limit off the account. */
  @Delete(FACILITY_ROUTE)
  @Idempotent()
  @Audited({ action: 'overdraft.close', entity: AUDIT_ENTITY, entityIdFrom: AUDIT_ID_FROM })
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ACCOUNT_PARAM) accountId: string,
  ): Promise<OverdraftFacility> {
    return this.overdrafts.close(user.userId, accountId);
  }
}
