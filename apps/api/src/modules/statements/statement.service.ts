/**
 * The statement archive: what exists, what one period says, and what an ad-hoc request
 * produces.
 *
 * There is no statements collection. A statement is a summary of postings that are
 * already recorded, so the archive is *enumerated* — one entry per complete month the
 * account has been open, up to the six years the bank keeps — and each entry's identifier
 * is derived from the period it covers. Nothing is written when a statement is listed,
 * read or requested, which is the property that makes "produce my statement again" free
 * of consequence.
 *
 * **Ownership is enforced here, once**, through `AccountService.requireOwned`. An account
 * belonging to another customer answers `ACCOUNT_NOT_FOUND`, never 403: a 403 confirms
 * the account exists, and an attacker walking `acc_` ids would learn the bank's roll.
 */

import { Injectable } from '@nestjs/common';

import {
  ErrorCode,
  routes,
  StatementFormat,
  type CursorQuery,
  type RequestStatement,
  type Statement,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { AccountService, type AccountRecord } from '../accounts/index.js';

import { DownloadLinkService } from './download-link.service.js';
import { StatementBuilderService, type PeriodSummary } from './statement-builder.service.js';
import { decodeStatementId, statementId } from './statement-id.js';
import { archivePeriods, customPeriod, type StatementPeriod } from './statement-period.js';
import { toContractStatement } from './statement.mapper.js';
import { DOCUMENT_SEGMENT } from './statements.constants.js';

/** An account and the period a signed download link resolved to. */
export interface ResolvedStatement {
  readonly account: AccountRecord;
  readonly period: StatementPeriod;
  readonly format: StatementFormat;
}

@Injectable()
export class StatementService {
  constructor(
    private readonly accounts: AccountService,
    private readonly builder: StatementBuilderService,
    private readonly links: DownloadLinkService,
    private readonly clock: ClockService,
  ) {}

  /** The monthly archive, newest first. */
  async list(input: {
    userId: string;
    accountId: string;
    query: CursorQuery;
  }): Promise<PageResult<Statement>> {
    const account = await this.accounts.requireOwned(input);
    const periods = archivePeriods({
      openedAt: account.openedAt,
      asOf: this.continueFrom(input.query.cursor),
      // One more than asked for, so the page knows whether there is another behind it.
      limit: input.query.limit + 1,
    });

    const summaries = await this.builder.archive(account, periods);
    return buildPage({
      records: summaries.map((summary) => this.present(account, summary, StatementFormat.PDF)),
      limit: input.query.limit,
      toCursor: (statement) => ({ sortValue: statement.periodStart, id: statement.id }),
    });
  }

  /** One statement, addressed by the identifier its period derives. */
  async get(input: { userId: string; accountId: string; statementId: string }): Promise<Statement> {
    const account = await this.accounts.requireOwned(input);
    const decoded = decodeStatementId(input.statementId, input.accountId);
    if (!decoded) throw AppError.notFound('Statement', input.statementId);

    const summary = await this.builder.detail(account, decoded.period);
    return this.present(account, summary, decoded.format);
  }

  /** An ad-hoc statement over a range the customer chose. */
  async request(input: {
    userId: string;
    accountId: string;
    request: RequestStatement;
  }): Promise<Statement> {
    if (input.request.accountId !== input.accountId) {
      throw new AppError({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'The statement must be requested for the account in the path.',
      });
    }

    const account = await this.accounts.requireOwned(input);
    const period = customPeriod(input.request.from, input.request.to);
    const summary = await this.builder.detail(account, period);

    return this.present(account, summary, input.request.format);
  }

  /**
   * Resolves a signed download link back to the account and period it names.
   *
   * No `userId`: the signature is the authority here, and it was only issued to a caller
   * whose ownership had already been checked. The account is still loaded, because the
   * document has to state whose it is.
   */
  async resolve(accountId: string, id: string): Promise<ResolvedStatement> {
    const decoded = decodeStatementId(id, accountId);
    if (!decoded) throw AppError.notFound('Statement', id);

    const account = await this.accounts.require(accountId);
    return { account, period: decoded.period, format: decoded.format };
  }

  /** Where the next page starts: the month before the last one returned. */
  private continueFrom(cursor: string | undefined): Date {
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (!decoded) return this.clock.now();

    const at = new Date(`${decoded.sortValue}T00:00:00.000Z`);
    return Number.isNaN(at.getTime()) ? this.clock.now() : at;
  }

  private present(
    account: AccountRecord,
    summary: PeriodSummary,
    format: StatementFormat,
  ): Statement {
    const id = statementId({ accountId: account.id, period: summary.period, format });
    const path = `${routes.accounts.statement(account.id, id)}/${DOCUMENT_SEGMENT}`;

    return toContractStatement({
      ...summary,
      id,
      accountId: account.id,
      downloadUrl: this.links.sign(path),
      generatedAt: this.clock.now(),
    });
  }
}
