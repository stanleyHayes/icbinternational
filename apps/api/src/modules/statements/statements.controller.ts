/**
 * Statements and letters: the documents a customer asks the bank for.
 *
 * Nothing on this controller writes. Producing a statement is a read of postings that are
 * already recorded and of the balance the ledger already attested to, so none of these
 * routes is `@Idempotent()` — there is nothing a replay could duplicate. Issuing a letter
 * is `@Audited()` all the same: "who did the bank confirm this customer's balance to, and
 * when" is a question an investigator will eventually ask.
 *
 * The two `/document` routes carry **no guard**. They are authorised by the signature in
 * their own URL, minted by the service that had already checked the caller holds the
 * account — see `DownloadLinkService` for why a cookie cannot be relied on for a download
 * that opens in a new tab. Everything else authenticates from the session, and every
 * mutation carries the CSRF double-submit check.
 *
 * Ownership is not checked here. It lives in `StatementService` and `LetterService`, so
 * it holds for every caller rather than for every caller who remembered.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Response } from 'express';

import {
  requestLetterSchema,
  requestStatementSchema,
  routes,
  type Paginated,
  type RequestLetter,
  type RequestStatement,
  type Statement,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { DownloadLinkService } from './download-link.service.js';
import { LetterService } from './letter.service.js';
import { StatementDocumentService, type RenderedDocument } from './statement-document.service.js';
import { StatementService } from './statement.service.js';
import { DOCUMENT_SEGMENT } from './statements.constants.js';
import {
  downloadQuerySchema,
  listDocumentsQuerySchema,
  type BankLetter,
  type DownloadQuery,
  type ListDocumentsQuery,
} from './statements.dto.js';

const ACCOUNT_PARAM = 'id';
const STATEMENT_PARAM = 'statementId';
const LETTER_PARAM = 'letterId';

const STATEMENTS_ROUTE = routes.accounts.statements(`:${ACCOUNT_PARAM}`);
const STATEMENT_ROUTE = routes.accounts.statement(`:${ACCOUNT_PARAM}`, `:${STATEMENT_PARAM}`);
const LETTER_ROUTE = `${routes.accounts.letters}/:${LETTER_PARAM}`;

@Controller()
export class StatementsController {
  constructor(
    private readonly statements: StatementService,
    private readonly documents: StatementDocumentService,
    private readonly letters: LetterService,
    private readonly links: DownloadLinkService,
  ) {}

  /** Letters first: `/accounts/letters` must win the match before `/accounts/:id` sees it. */
  @Get(routes.accounts.letters)
  @UseGuards(JwtAuthGuard)
  listLetters(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listDocumentsQuerySchema)) query: ListDocumentsQuery,
  ): Promise<Paginated<BankLetter>> {
    return this.letters.list(user.userId, query);
  }

  /** Asks the bank to write a letter about one account. */
  @Post(routes.accounts.letters)
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'letter.issue', entity: 'letter', entityIdFrom: 'body.accountId' })
  issueLetter(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(requestLetterSchema)) request: RequestLetter,
  ): Promise<BankLetter> {
    return this.letters.issue(user.userId, request);
  }

  /** The rendered letter, for a link the bank signed. */
  @Get(`${LETTER_ROUTE}/${DOCUMENT_SEGMENT}`)
  async letterDocument(
    @Param(LETTER_PARAM) id: string,
    @Query(zodBody(downloadQuerySchema)) query: DownloadQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Buffer> {
    const accountId = this.verify(`${routes.accounts.letters}/${id}/${DOCUMENT_SEGMENT}`, query);
    const rendered = await this.letters.render({
      accountId,
      letterId: id,
      addressedTo: query.addressedTo ?? null,
    });

    return attach(response, rendered);
  }

  /** The monthly archive for one account, newest first. */
  @Get(STATEMENTS_ROUTE)
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ACCOUNT_PARAM) accountId: string,
    @Query(zodBody(listDocumentsQuerySchema)) query: ListDocumentsQuery,
  ): Promise<Paginated<Statement>> {
    return this.statements.list({ userId: user.userId, accountId, query });
  }

  /** An ad-hoc statement over a range the customer chose. */
  @Post(STATEMENTS_ROUTE)
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ACCOUNT_PARAM) accountId: string,
    @Body(zodBody(requestStatementSchema)) request: RequestStatement,
  ): Promise<Statement> {
    return this.statements.request({ userId: user.userId, accountId, request });
  }

  /** One statement, with a freshly signed download link. */
  @Get(STATEMENT_ROUTE)
  @UseGuards(JwtAuthGuard)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ACCOUNT_PARAM) accountId: string,
    @Param(STATEMENT_PARAM) statementId: string,
  ): Promise<Statement> {
    return this.statements.get({ userId: user.userId, accountId, statementId });
  }

  /** The rendered statement, for a link the bank signed. */
  @Get(`${STATEMENT_ROUTE}/${DOCUMENT_SEGMENT}`)
  async document(
    @Param(ACCOUNT_PARAM) accountId: string,
    @Param(STATEMENT_PARAM) statementId: string,
    @Query(zodBody(downloadQuerySchema)) query: DownloadQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Buffer> {
    const path = `${routes.accounts.statement(accountId, statementId)}/${DOCUMENT_SEGMENT}`;
    this.verify(path, query);

    const resolved = await this.statements.resolve(accountId, statementId);
    return attach(response, await this.documents.render(resolved));
  }

  /**
   * Checks the signature and returns the account the link names.
   *
   * The account travels inside the signature on letter links because the letters path has
   * no account segment to take it from — and being inside the signature is what stops a
   * link being re-pointed at somebody else's account by editing the query string.
   */
  private verify(path: string, query: DownloadQuery): string {
    const signed = {
      ...(query.account ? { account: query.account } : {}),
      ...(query.addressedTo ? { addressedTo: query.addressedTo } : {}),
    };

    this.links.verify({ path, query: signed, expires: query.expires, signature: query.signature });
    return query.account ?? '';
  }
}

/**
 * Writes the document out under its own headers.
 *
 * A `Buffer` passes through `ResponseEnvelopeInterceptor` untouched, so the bytes reach
 * the customer unwrapped.
 */
function attach(response: Response, rendered: RenderedDocument): Buffer {
  response.setHeader('Content-Type', rendered.contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${rendered.filename}"`);
  response.setHeader('Content-Length', rendered.body.byteLength);
  return rendered.body;
}
