import { Controller, Get, Query } from '@nestjs/common';

import { Permission, routes, type Hold } from '@reliance/contracts';

import { AdminEndpoint } from '../rbac/index.js';

import { toContractHold } from './hold.mapper.js';
import { type AdminHoldQuery, HoldStore } from './hold.store.js';

const DEFAULT_LIMIT = 30;

/** Admin console: cross-account hold listing. */
@Controller()
export class AdminHoldsController {
  constructor(private readonly holds: HoldStore) {}

  /** `GET /admin/holds?cursor=&limit=30` — all holds, newest first. */
  @Get(routes.admin.holds)
  @AdminEndpoint(Permission.HOLD_MANAGE)
  async list(
    @Query('cursor') cursor?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<{ data: Hold[]; hasMore: boolean }> {
    const limit = rawLimit ? Math.min(Number(rawLimit), 100) : DEFAULT_LIMIT;
    const query: AdminHoldQuery = { cursor, limit };
    const records = await this.holds.listAdmin(query);
    const hasMore = records.length > limit;
    return { data: records.slice(0, limit).map(toContractHold), hasMore };
  }
}
