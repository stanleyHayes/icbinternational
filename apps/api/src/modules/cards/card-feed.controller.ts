import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import {
  routes,
  type CardAuthorisation,
  type Paginated,
  type Transaction,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { CardFeedService } from './card-feed.service.js';
import {
  cardTransactionsQuerySchema,
  listCardAuthorisationsQuerySchema,
  type CardTransactionsQuery,
  type ListCardAuthorisationsQuery,
} from './cards.dto.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/**
 * What a card has been used for.
 *
 * Two feeds, because they answer different questions. The transaction feed is the
 * statement: money that moved. The authorisation feed includes **declines**, which have
 * no statement row precisely because nothing moved — and which are the rows a customer
 * asks about most. Filtering refusals out of a card's history would leave the app unable
 * to answer "why was my card refused?", which is the single commonest question a card
 * issuer is ever asked.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CardFeedController {
  constructor(private readonly feed: CardFeedService) {}

  /** Statement rows produced by one card, newest first. */
  @Get(routes.cards.transactions(`:${ID_PARAM}`))
  async transactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) cardId: string,
    @Query(zodBody(cardTransactionsQuerySchema)) query: CardTransactionsQuery,
  ): Promise<Paginated<Transaction>> {
    return this.feed.transactionsFor({ userId: user.userId, cardId, ...query });
  }

  /** The authorisation feed across every card, approvals and refusals alike. */
  @Get(routes.cards.authorisations)
  async authorisations(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listCardAuthorisationsQuerySchema)) query: ListCardAuthorisationsQuery,
  ): Promise<Paginated<CardAuthorisation>> {
    return this.feed.authorisationsFor({ userId: user.userId, ...query });
  }
}
