import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createTransferRequestSchema,
  listTransfersQuerySchema,
  routes,
  transferQuoteRequestSchema,
  type CreateTransferRequest,
  type ListTransfersQuery,
  type Paginated,
  type Transfer,
  type TransferQuote,
  type TransferQuoteRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { InternalTransferUseCase } from './internal-transfer.use-case.js';
import { TransferQuoteService } from './transfer-quote.service.js';
import { STEP_UP_HEADER } from './transfer.constants.js';
import { toContractTransfer } from './transfer.mapper.js';
import { TransferService } from './transfer.service.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'transfer';

/**
 * Moving money out of an account.
 *
 * Three things are true of the create route and all three are deliberate.
 *
 * **`@Idempotent()`** — a network timeout tells the client nothing about whether the server
 * acted. Without replay protection a client either retries and sends the money twice, or
 * refuses to and strands a payment in an unknown state. Both are worse than a header.
 *
 * **`@Audited()`** — a payment is the event an investigator reconstructs a fraud from, and
 * a trail that has to be remembered per-endpoint is a trail with holes in it.
 *
 * **Quote and execute are separate calls.** The quote is where the price is fixed; the
 * create route binds to it. A single endpoint that priced and paid in one go would give
 * the customer no moment at which they saw the figures before agreeing to them.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class TransfersController {
  constructor(
    private readonly quotes: TransferQuoteService,
    private readonly internal: InternalTransferUseCase,
    private readonly transfers: TransferService,
  ) {}

  /** Prices a transfer and holds that price for a window. Writes no money. */
  @Post(routes.transfers.quote)
  @HttpCode(HttpStatus.OK)
  async quote(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(transferQuoteRequestSchema)) request: TransferQuoteRequest,
  ): Promise<TransferQuote> {
    return this.quotes.quote({ userId: user.userId, request });
  }

  /**
   * Sends the money.
   *
   * The step-up proof travels in a header rather than the body because it authenticates the
   * *request*, not the payment: it is credential material, and credential material has no
   * business in a payload that gets logged, echoed back and validated against a schema.
   */
  @Post(routes.transfers.create)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'transfer.create', entity: AUDIT_ENTITY })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createTransferRequestSchema)) request: CreateTransferRequest,
    @Headers(STEP_UP_HEADER) stepUpToken?: string,
  ): Promise<Transfer> {
    const record = await this.internal.execute({
      userId: user.userId,
      request,
      ...(stepUpToken ? { stepUpToken } : {}),
    });

    return toContractTransfer(record);
  }

  @Get(routes.transfers.list)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listTransfersQuerySchema)) query: ListTransfersQuery,
  ): Promise<Paginated<Transfer>> {
    return this.transfers.list(user.userId, query);
  }

  @Get(routes.transfers.byId(`:${ID_PARAM}`))
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) transferId: string,
  ): Promise<Transfer> {
    return this.transfers.get(user.userId, transferId);
  }

  @Post(routes.transfers.cancel(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'transfer.cancel', entity: AUDIT_ENTITY, entityIdFrom: 'params.id' })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) transferId: string,
  ): Promise<Transfer> {
    return this.transfers.cancel(user.userId, transferId);
  }
}
