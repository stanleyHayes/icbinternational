import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createFxAlertRequestSchema,
  currencyCodeSchema,
  executeFxRequestSchema,
  fxQuoteRequestSchema,
  routes,
  type CreateFxAlertRequest,
  type FxAlert,
  type FxBoard,
  type FxQuote,
  type FxQuoteRequest,
  type FxRate,
  type Paginated,
  type Transfer,
} from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { FxAlertService, toContractAlert } from './fx-alert.service.js';
import { FxExecutionService } from './fx-execution.service.js';
import { FxQuoteService } from './fx-quote.service.js';
import { FxRateService } from './fx-rate.service.js';
import { toContractConversion, toContractQuote } from './fx.mapper.js';

const ID_PARAM = 'id';
const AUDIT_ENTITY = 'fx';

/**
 * Foreign exchange: the board, the quote, the trade and the watch list.
 *
 * **Quote and convert are separate calls, and that is the product.** The quote is where
 * the bank commits to a price; the convert call binds to it. One endpoint that priced and
 * traded together would give the customer no moment at which they had seen the rate, the
 * spread and the amount before agreeing to them — and no way to prove afterwards what they
 * had been shown.
 *
 * `@Idempotent()` on the convert route because a network timeout tells the client nothing
 * about whether the server acted, and the wrong guess is a second conversion.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class FxController {
  constructor(
    private readonly rates: FxRateService,
    private readonly quotes: FxQuoteService,
    private readonly conversions: FxExecutionService,
    private readonly alerts: FxAlertService,
  ) {}

  /** Every pair the bank quotes, priced for this customer. */
  @Get(routes.fx.rates)
  async listRates(
    @CurrentUser() user: AuthenticatedUser,
    @Query('to') to?: string,
  ): Promise<Paginated<FxRate>> {
    return this.rates.list(user.userId, parseCurrency(to));
  }

  @Get(routes.fx.board)
  async board(@CurrentUser() user: AuthenticatedUser): Promise<FxBoard> {
    return this.rates.board(user.userId);
  }

  /** Prices a conversion and holds that price. Writes no money. */
  @Post(routes.fx.quote)
  @HttpCode(HttpStatus.OK)
  async quote(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(fxQuoteRequestSchema)) request: FxQuoteRequest,
  ): Promise<FxQuote> {
    return toContractQuote(await this.quotes.quote({ userId: user.userId, request }));
  }

  /** Executes a held price. Refuses rather than repricing once the window has closed. */
  @Post(routes.fx.convert)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'fx.convert', entity: AUDIT_ENTITY })
  async convert(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(executeFxRequestSchema)) request: { quoteId: string },
  ): Promise<Transfer> {
    const executed = await this.conversions.execute({
      userId: user.userId,
      quoteId: request.quoteId,
    });

    return toContractConversion(executed);
  }

  @Get(routes.fx.alerts)
  async listAlerts(@CurrentUser() user: AuthenticatedUser): Promise<Paginated<FxAlert>> {
    const alerts = await this.alerts.list(user.userId);
    const data = alerts.map((alert) => toContractAlert(alert));

    return {
      data,
      page: { cursor: null, limit: data.length, hasMore: false, total: data.length },
    };
  }

  @Post(routes.fx.alerts)
  @HttpCode(HttpStatus.CREATED)
  @Audited({ action: 'fx.alert.create', entity: AUDIT_ENTITY })
  async createAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createFxAlertRequestSchema)) request: CreateFxAlertRequest,
  ): Promise<FxAlert> {
    return toContractAlert(await this.alerts.create(user.userId, request));
  }

  @Get(routes.fx.alert(`:${ID_PARAM}`))
  async getAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) alertId: string,
  ): Promise<FxAlert> {
    return toContractAlert(await this.alerts.get(user.userId, alertId));
  }

  @Delete(routes.fx.alert(`:${ID_PARAM}`))
  @Audited({ action: 'fx.alert.remove', entity: AUDIT_ENTITY, entityIdFrom: 'params.id' })
  async removeAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) alertId: string,
  ): Promise<FxAlert> {
    return toContractAlert(await this.alerts.remove(user.userId, alertId));
  }
}

/** A currency filter from the query string, or undefined when it was not supplied. */
function parseCurrency(value: string | undefined): CurrencyCode | undefined {
  if (!value) return undefined;
  return currencyCodeSchema.parse(value.toUpperCase());
}
