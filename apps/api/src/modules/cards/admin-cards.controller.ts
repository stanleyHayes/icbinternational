import { Controller, Get, Query } from '@nestjs/common';

import { Permission, routes, type Card } from '@reliance/contracts';

import { AdminEndpoint } from '../rbac/index.js';

import { toContractCard } from './card.mapper.js';
import { type AdminCardQuery, CardStore } from './card.store.js';

const DEFAULT_LIMIT = 30;

/** Admin console: cross-customer card listing. */
@Controller()
export class AdminCardsController {
  constructor(private readonly cards: CardStore) {}

  /** `GET /admin/cards?cursor=&limit=30` — all cards, newest first. */
  @Get(routes.admin.cards)
  @AdminEndpoint(Permission.CARD_MANAGE)
  async list(
    @Query('cursor') cursor?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<{ data: Card[]; hasMore: boolean }> {
    const limit = rawLimit ? Math.min(Number(rawLimit), 100) : DEFAULT_LIMIT;
    const query: AdminCardQuery = { cursor, limit };
    const { records } = await this.cards.listAdmin(query);
    const hasMore = records.length > limit;
    return { data: records.slice(0, limit).map(toContractCard), hasMore };
  }
}
