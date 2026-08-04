import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import {
  createPaymentRequestSchema,
  entityId,
  routes,
  splitBillRequestSchema,
  type CreatePaymentRequestRequest,
  type Paginated,
  type PaymentRequest,
  type SplitBillRequest,
} from '@reliance/contracts';

import { fromWire } from '../../common/money/money.codec.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsersService } from '../auth/users/index.js';
import { Idempotent } from '../idempotency/index.js';

import { PaymentRequestSettlementService } from './payment-request-settlement.service.js';
import { toContractPaymentRequest } from './payment-request.mapper.js';
import { PaymentRequestService } from './payment-request.service.js';
import { SplitBillService } from './split-bill.service.js';

const ID_PARAM = 'id';
const AUDIT_ENTITY = 'payment-request';

/**
 * The body of a pay call.
 *
 * Declared here rather than imported: the frozen contract carries the route
 * (`POST /payment-requests/:id/pay`) but never named a request schema for it. The shape is
 * the minimum the operation needs — which account the payer is settling from — and
 * `docs/HANDOFFS.md` carries the request to promote it into `packages/contracts`.
 */
const payRequestBodySchema = z.object({ sourceAccountId: entityId('acc') });

/**
 * Asking somebody to pay you.
 *
 * `DELETE` closes a request, and what that means depends on who is calling: the person who
 * raised it is withdrawing their ask, and anybody else is turning it down. One endpoint,
 * because both close the request and neither moves money — two would give the client two
 * ways to say the same thing and the bank two paths to keep in step.
 *
 * `GET /payment-requests/:id` is intentionally not owner-scoped. A request is a link, and
 * the person opening it is by definition not the person who made it.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class PaymentRequestsController {
  constructor(
    private readonly requests: PaymentRequestService,
    private readonly settlement: PaymentRequestSettlementService,
    private readonly splits: SplitBillService,
    private readonly users: UsersService,
  ) {}

  @Get(routes.payments.requests)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<Paginated<PaymentRequest>> {
    const records = await this.requests.list(user.userId);
    return asPage(records.map((record) => toContractPaymentRequest(record)));
  }

  @Post(routes.payments.requests)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'payment-request.create', entity: AUDIT_ENTITY })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createPaymentRequestSchema)) request: CreatePaymentRequestRequest,
  ): Promise<PaymentRequest> {
    const raised = await this.requests.create({
      userId: user.userId,
      destinationAccountId: request.destinationAccountId,
      amount: fromWire(request.amount),
      expiresInHours: request.expiresInHours,
      ...(request.note === undefined ? {} : { note: request.note }),
    });

    return toContractPaymentRequest(raised);
  }

  /** One request per participant, together adding up to exactly the total. */
  @Post(routes.payments.splitBill)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'payment-request.split', entity: AUDIT_ENTITY })
  async split(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(splitBillRequestSchema)) request: SplitBillRequest,
  ): Promise<Paginated<PaymentRequest>> {
    const raised = await this.splits.split({ userId: user.userId, request });
    return asPage(raised.map((record) => toContractPaymentRequest(record)));
  }

  @Get(routes.payments.request(`:${ID_PARAM}`))
  async get(@Param(ID_PARAM) requestId: string): Promise<PaymentRequest> {
    return toContractPaymentRequest(await this.requests.get(requestId));
  }

  /** Settles the request from one of the payer's own accounts. */
  @Post(routes.payments.payRequest(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audited({
    action: 'payment-request.pay',
    entity: AUDIT_ENTITY,
    entityIdFrom: 'params.id',
  })
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) requestId: string,
    @Body(zodBody(payRequestBodySchema)) body: { sourceAccountId: string },
  ): Promise<PaymentRequest> {
    const payer = await this.users.requireById(user.userId);

    const paid = await this.settlement.pay({
      requestId,
      payerUserId: user.userId,
      payerName: `${payer.firstName} ${payer.lastName}`.trim(),
      sourceAccountId: body.sourceAccountId,
    });

    return toContractPaymentRequest(paid);
  }

  /** Withdraws the request, or declines it — see the note on this controller. */
  @Delete(routes.payments.request(`:${ID_PARAM}`))
  @Audited({
    action: 'payment-request.close',
    entity: AUDIT_ENTITY,
    entityIdFrom: 'params.id',
  })
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) requestId: string,
  ): Promise<PaymentRequest> {
    return toContractPaymentRequest(
      await this.requests.close({ id: requestId, userId: user.userId }),
    );
  }
}

/** The list envelope for a collection the contract does not paginate. */
function asPage(data: PaymentRequest[]): Paginated<PaymentRequest> {
  return { data, page: { cursor: null, limit: data.length, hasMore: false, total: data.length } };
}
