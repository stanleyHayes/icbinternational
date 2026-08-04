import { Body, Controller, Get, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';

import {
  exportTransactionsQuerySchema,
  listTransactionsQuerySchema,
  routes,
  updateTransactionRequestSchema,
  type ExportTransactionsQuery,
  type ListTransactionsQuery,
  type Paginated,
  type Transaction,
  type UpdateTransactionRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { renderReceipt } from './export/receipt.renderer.js';
import { TransactionExportService, type ExportedFile } from './transaction-export.service.js';
import { TransactionService } from './transaction.service.js';

/**
 * The customer's transaction feed.
 *
 * Every route is authenticated and every one is scoped to the caller inside the query
 * itself — see `TransactionService`. There is no route parameter on this controller that
 * can address another customer's data, because ownership is a `where` clause rather than
 * a check somebody has to remember to perform.
 *
 * `/transactions/export` is declared before `/transactions/:id` in the route map and must
 * stay that way: Nest matches in declaration order, and the reverse would route the word
 * "export" into `:id` and answer 404 for the whole export endpoint.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionService,
    private readonly exporter: TransactionExportService,
  ) {}

  /** A page of the feed. Cursor-paginated; the filter set is the contract's. */
  @Get(routes.transactions.list)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listTransactionsQuerySchema)) query: ListTransactionsQuery,
  ): Promise<Paginated<Transaction>> {
    return this.transactions.list(user.userId, query);
  }

  /**
   * A date range of one account as a downloadable file.
   *
   * Declared before `:id` so the literal path wins the match.
   */
  @Get(routes.transactions.export)
  async exportRange(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(exportTransactionsQuerySchema)) query: ExportTransactionsQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Buffer> {
    return attach(response, await this.exporter.export(user.userId, query));
  }

  /** One transaction. A row belonging to someone else answers 404, never 403. */
  @Get(routes.transactions.byId(':id'))
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Transaction> {
    return this.transactions.get({ userId: user.userId, transactionId: id });
  }

  /** A plain-text receipt for one transaction, suitable for an expense claim. */
  @Get(routes.transactions.receipt(':id'))
  async receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Buffer> {
    const record = await this.transactions.requireOwned({
      userId: user.userId,
      transactionId: id,
    });

    return attach(response, {
      body: Buffer.from(renderReceipt(record), 'utf8'),
      contentType: 'text/plain; charset=utf-8',
      filename: `receipt_${record.id}.txt`,
    });
  }

  /** The two fields a customer owns: their category correction and their own note. */
  @Patch(routes.transactions.update(':id'))
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodBody(updateTransactionRequestSchema)) body: UpdateTransactionRequest,
  ): Promise<Transaction> {
    return this.transactions.update({ userId: user.userId, transactionId: id }, body);
  }
}

/**
 * Sets the download headers and returns the bytes.
 *
 * A `Buffer` passes through `ResponseEnvelopeInterceptor` untouched, which is the
 * documented way to return something that is not a JSON resource. `passthrough: true`
 * keeps Nest in charge of sending it, so the exception filter still applies if anything
 * downstream throws.
 */
function attach(response: Response, exported: ExportedFile): Buffer {
  response.setHeader('Content-Type', exported.contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
  response.setHeader('Content-Length', exported.body.byteLength);
  return exported.body;
}
