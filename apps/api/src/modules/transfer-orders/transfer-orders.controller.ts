import {
  Body,
  Controller,
  Delete,
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
  createTransferOrderRequestSchema,
  routes,
  type CreateTransferOrderRequest,
  type Paginated,
  type TransferOrder,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { TransferOrderLifecycleService } from './transfer-order-lifecycle.service.js';
import { TRANSFER_ORDER_AUDIT_ENTITY } from './transfer-order.constants.js';
import { toContractTransferOrder } from './transfer-order.mapper.js';
import { TransferOrderRepository } from './transfer-order.repository.js';
import { TransferOrderService } from './transfer-order.service.js';
import {
  listTransferOrdersQuerySchema,
  pauseTransferOrderRequestSchema,
  updateTransferOrderRequestSchema,
  type ListTransferOrdersQuery,
  type PauseTransferOrderRequest,
  type UpdateTransferOrderRequest,
} from './transfer-orders.dto.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

const ORDER_ROUTE = routes.transferOrders.byId(`:${ID_PARAM}`);

/** Everything this controller writes is audited under the same entity family. */
const AUDIT = { entity: TRANSFER_ORDER_AUDIT_ENTITY, subjectLoader: TransferOrderRepository };

/**
 * A customer's standing orders: setting them up, following them, and stopping them.
 *
 * `CsrfGuard` sits on the mutations only. These routes authenticate from a cookie, which
 * is exactly what a cross-site request can ride on, so every state change carries the
 * double-submit check — but a read cannot be weaponised that way and the client does not
 * send the header on one, so requiring it there would break the list rather than protect
 * it.
 *
 * `@Idempotent()` is on creating and skipping, and on neither of the others. Creating
 * commits the customer to future money movement, so a resubmitted form must resolve to
 * the order that exists rather than to a second one paying the same payee twice a month.
 * Skipping is a relative move — each call pushes the next payment on by one period — so
 * without replay protection a retried request would drop two months instead of one.
 * Pausing, amending and cancelling all converge: the same request twice leaves the same
 * state, and a key would buy nothing.
 *
 * No handler here checks ownership. That rule lives in `TransferOrderService.get`, so it
 * holds for every caller rather than for every caller who remembered.
 */
@Controller()
export class TransferOrdersController {
  constructor(
    private readonly orders: TransferOrderService,
    private readonly lifecycle: TransferOrderLifecycleService,
  ) {}

  @Get(routes.transferOrders.list)
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listTransferOrdersQuerySchema)) query: ListTransferOrdersQuery,
  ): Promise<Paginated<TransferOrder>> {
    const page = await this.orders.list(user.userId, query);
    return { data: page.data.map(toContractTransferOrder), page: page.page };
  }

  /** Sets up a repeating payment. Month-ends clamp rather than skip. */
  @Post(routes.transferOrders.create)
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Idempotent()
  @Audited({ action: 'transfer-order.create', ...AUDIT })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createTransferOrderRequestSchema)) request: CreateTransferOrderRequest,
  ): Promise<TransferOrder> {
    const order = await this.orders.create({ userId: user.userId, request });
    return toContractTransferOrder(order);
  }

  @Get(ORDER_ROUTE)
  @UseGuards(JwtAuthGuard)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) orderId: string,
  ): Promise<TransferOrder> {
    return toContractTransferOrder(await this.orders.get(user.userId, orderId));
  }

  /** Changes the amount, name, reference or ending. The payee and the cadence are fixed. */
  @Patch(ORDER_ROUTE)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'transfer-order.amend', ...AUDIT })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) orderId: string,
    @Body(zodBody(updateTransferOrderRequestSchema)) request: UpdateTransferOrderRequest,
  ): Promise<TransferOrder> {
    const order = await this.lifecycle.amend({ userId: user.userId, orderId, request });
    return toContractTransferOrder(order);
  }

  /** Stops the standing order. Nothing further is paid; what has been paid is unaffected. */
  @Delete(ORDER_ROUTE)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'transfer-order.cancel', ...AUDIT })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) orderId: string,
  ): Promise<{ acknowledged: true }> {
    await this.lifecycle.cancel({ userId: user.userId, orderId });
    return { acknowledged: true };
  }

  /** Drops the next payment only. The schedule carries on afterwards. */
  @Post(routes.transferOrders.skip(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Idempotent()
  @Audited({ action: 'transfer-order.skip', ...AUDIT })
  async skip(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) orderId: string,
  ): Promise<TransferOrder> {
    const order = await this.lifecycle.skipNext({ userId: user.userId, orderId });
    return toContractTransferOrder(order);
  }

  /** Pauses the whole schedule, or puts it back on its cadence. */
  @Post(routes.transferOrders.pause(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'transfer-order.pause', ...AUDIT })
  async pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) orderId: string,
    @Body(zodBody(pauseTransferOrderRequestSchema)) request: PauseTransferOrderRequest,
  ): Promise<TransferOrder> {
    const order = await this.lifecycle.setPaused({ userId: user.userId, orderId, request });
    return toContractTransferOrder(order);
  }
}
