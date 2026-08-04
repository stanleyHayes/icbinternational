import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createBillPaymentRequestSchema,
  createTopUpRequestSchema,
  listBillersQuerySchema,
  routes,
  type Biller,
  type BillPayment,
  type CreateBillPaymentRequest,
  type CreateTopUpRequest,
  type Paginated,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { BillPayService } from './bill-pay.service.js';
import { BillPaymentQueryService } from './bill-payment-query.service.js';
import { toContractBillPayment } from './bill-payment.mapper.js';
import { BillerDirectoryService, type ListBillersQuery } from './biller-directory.service.js';
import { TopUpService } from './top-up.service.js';

const ID_PARAM = 'id';
const AUDIT_ENTITY = 'bill-payment';

/**
 * Paying bills, and topping up a phone.
 *
 * Both mutating routes carry `@Idempotent()`. A bill payment is the archetypal case for it:
 * the request debits the customer before it answers, so a client that retries a timed-out
 * call without replay protection pays the bill twice — and the second payment is a refund
 * the customer has to go and ask a third party for.
 *
 * The response is returned as soon as the money is secured and the job is queued, with the
 * payment in `PENDING`. Holding the connection open while a biller decides would make the
 * customer wait on somebody else's systems and would leave the bank unable to say what
 * happened if the connection dropped mid-conversation.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class BillPayController {
  constructor(
    private readonly directory: BillerDirectoryService,
    private readonly payments: BillPaymentQueryService,
    private readonly billPay: BillPayService,
    private readonly topUps: TopUpService,
  ) {}

  @Get(routes.payments.billers)
  async listBillers(
    @Query(zodBody(listBillersQuerySchema)) query: ListBillersQuery,
  ): Promise<Paginated<Biller>> {
    return this.directory.list(query);
  }

  @Get(routes.payments.biller(`:${ID_PARAM}`))
  async getBiller(@Param(ID_PARAM) billerId: string): Promise<Biller> {
    return this.directory.require(billerId);
  }

  @Get(routes.payments.billPayments)
  async listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: BillPayment['status'],
    @Query('billerId') billerId?: string,
  ): Promise<Paginated<BillPayment>> {
    const records = await this.payments.list({
      userId: user.userId,
      ...(status ? { status } : {}),
      ...(billerId ? { billerId } : {}),
    });

    const data = records.map((record) => toContractBillPayment(record));
    return { data, page: { cursor: null, limit: data.length, hasMore: false, total: data.length } };
  }

  /** Validates, debits and queues the payment. Answers as soon as the money is secured. */
  @Post(routes.payments.billPayments)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'billpay.create', entity: AUDIT_ENTITY })
  async payBill(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createBillPaymentRequestSchema)) request: CreateBillPaymentRequest,
  ): Promise<BillPayment> {
    const payment = await this.billPay.create({ userId: user.userId, request });
    return toContractBillPayment(payment);
  }

  @Get(routes.payments.billPayment(`:${ID_PARAM}`))
  async getPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) paymentId: string,
  ): Promise<BillPayment> {
    return toContractBillPayment(await this.payments.get(user.userId, paymentId));
  }

  @Post(routes.payments.topUps)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'billpay.topup', entity: AUDIT_ENTITY })
  async topUp(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createTopUpRequestSchema)) request: CreateTopUpRequest,
  ): Promise<BillPayment> {
    const payment = await this.topUps.create({ userId: user.userId, request });
    return toContractBillPayment(payment);
  }
}
