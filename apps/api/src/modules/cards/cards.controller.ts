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
  activateCardRequestSchema,
  issueCardRequestSchema,
  reportCardRequestSchema,
  routes,
  type Card,
  type IssueCardRequest,
  type Paginated,
  type ReportCardRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { toContractCard } from './card.mapper.js';
import { CardService } from './card.service.js';
import {
  listCardsQuerySchema,
  updateCardRequestSchema,
  type ListCardsQuery,
  type UpdateCardRequest,
} from './cards.dto.js';
import { CardIssuingService } from './issuing/card-issuing.service.js';
import { CardLifecycleService } from './lifecycle/card-lifecycle.service.js';
import { CardReplacementService } from './lifecycle/card-replacement.service.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'card';

/** The reason recorded when a customer cancels a card themselves. */
const CUSTOMER_CANCELLED = 'CUSTOMER_REQUEST';

/**
 * A customer's cards: ordering them, and the things that change what they can do.
 *
 * Every mutating route is `@Idempotent()` and `@Audited()`, and both are load-bearing.
 * Issuing a card twice because a request timed out puts a real piece of plastic in the
 * post that nobody asked for; freezing a card is the action an investigator most needs a
 * timestamp for, because "when did you stop the card?" is the first question after a
 * compromise.
 *
 * The routes that reveal or change credentials — the PAN, the PIN, the controls — live in
 * `CardDetailsController` behind `@StepUp()`. Splitting them is not cosmetic: it keeps
 * "which of our card endpoints demand re-authentication?" answerable by looking at one
 * file rather than by reading every decorator in the lane.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(
    private readonly cards: CardService,
    private readonly issuing: CardIssuingService,
    private readonly lifecycle: CardLifecycleService,
    private readonly replacement: CardReplacementService,
  ) {}

  @Get(routes.cards.list)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listCardsQuerySchema)) query: ListCardsQuery,
  ): Promise<Paginated<Card>> {
    return this.cards.list({ userId: user.userId, ...query });
  }

  /**
   * Orders a card.
   *
   * A virtual card is spendable the moment this returns. A physical one is a
   * manufacturing order and comes back `ORDERED`; the client shows the delivery stages
   * rather than pretending the card is ready.
   */
  @Post(routes.cards.create)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'card.issue', entity: AUDIT_ENTITY })
  async issue(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(issueCardRequestSchema)) request: IssueCardRequest,
  ): Promise<Card> {
    return toContractCard(await this.issuing.issue({ userId: user.userId, request }));
  }

  @Get(routes.cards.byId(`:${ID_PARAM}`))
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
  ): Promise<Card> {
    return this.cards.get(user.userId, cardId);
  }

  @Patch(routes.cards.byId(`:${ID_PARAM}`))
  @Audited({ action: 'card.update', entity: AUDIT_ENTITY })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
    @Body(zodBody(updateCardRequestSchema)) changes: UpdateCardRequest,
  ): Promise<Card> {
    return this.cards.update({ userId: user.userId, cardId, changes });
  }

  /** Cancels a card permanently. Use freeze for anything the customer may undo. */
  @Delete(routes.cards.byId(`:${ID_PARAM}`))
  @Idempotent()
  @Audited({ action: 'card.cancel', entity: AUDIT_ENTITY })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
  ): Promise<Card> {
    const card = await this.cards.requireOwned(user.userId, cardId);
    return toContractCard(await this.lifecycle.cancel(card, CUSTOMER_CANCELLED));
  }

  /**
   * Activates a delivered card.
   *
   * The last four digits prove the customer is holding it and the PIN is set in the same
   * call, so a card is never simultaneously live and PIN-less.
   */
  @Post(routes.cards.activate(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audited({ action: 'card.activate', entity: AUDIT_ENTITY })
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
    @Body(zodBody(activateCardRequestSchema)) body: { last4: string; pin: string },
  ): Promise<Card> {
    const card = await this.cards.requireOwned(user.userId, cardId);
    return toContractCard(await this.lifecycle.activate({ card, ...body }));
  }

  @Post(routes.cards.freeze(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'card.freeze', entity: AUDIT_ENTITY })
  async freeze(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
  ): Promise<Card> {
    const card = await this.cards.requireOwned(user.userId, cardId);
    return toContractCard(await this.lifecycle.freeze(card));
  }

  @Post(routes.cards.unfreeze(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'card.unfreeze', entity: AUDIT_ENTITY })
  async unfreeze(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
  ): Promise<Card> {
    const card = await this.cards.requireOwned(user.userId, cardId);
    return toContractCard(await this.lifecycle.unfreeze(card));
  }

  /**
   * Reports a card lost, stolen, damaged or never delivered.
   *
   * Returns the **replacement** where one was ordered, because that is the card the
   * customer now cares about and the one the client needs an id for. The reported card is
   * already dead by the time this responds.
   */
  @Post(routes.cards.report(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'card.report', entity: AUDIT_ENTITY })
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
    @Body(zodBody(reportCardRequestSchema)) request: ReportCardRequest,
  ): Promise<Card> {
    const card = await this.cards.requireOwned(user.userId, cardId);
    const result = await this.replacement.report({ userId: user.userId, card, request });

    return toContractCard(result.replacement ?? result.reported);
  }
}
