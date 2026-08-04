import { Controller, Get, Query } from '@nestjs/common';

import { Permission, routes, type Paginated, type Transaction } from '@reliance/contracts';

import { clampLimit } from '../../common/pagination/cursor.js';
import { AdminEndpoint } from '../rbac/index.js';

import { type AdminTransactionQuery, TransactionStore } from './repositories/transaction.store.js';
import { toTransactionResponse } from './transaction.presenter.js';

/** Admin console: cross-customer transaction listing. */
@Controller()
export class AdminTransactionsController {
  constructor(private readonly store: TransactionStore) {}

  /** `GET /admin/transactions?cursor=&limit=30` — all transactions, newest first. */
  @Get(routes.admin.transactions)
  @AdminEndpoint(Permission.TRANSACTION_READ)
  async list(
    @Query('cursor') cursor?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<Paginated<Transaction>> {
    const query: AdminTransactionQuery = { cursor, limit: clampLimit(rawLimit) };
    const page = await this.store.listAdmin(query);
    // The house list envelope — `{ data, page }`, per §4.5 — rather than a shape invented
    // here. Every other list in the product answers this way, and the console's table
    // component reads `page.cursor` to fetch the next one.
    return { data: page.data.map(toTransactionResponse), page: page.page };
  }
}
