/**
 * A customer's live loans: balances, schedules, repayments and settlement figures.
 *
 * Every handler takes the caller's id from the verified token and passes it into the
 * service, which resolves the loan *through* that id. There is no path here that reads a
 * loan by id alone, which makes reading somebody else's structurally impossible rather
 * than merely guarded — and is why the attempt answers `LOAN_NOT_FOUND` and not
 * `FORBIDDEN`, since a 403 would confirm the id belongs to somebody.
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
  UseGuards,
} from '@nestjs/common';

import {
  repayLoanRequestSchema,
  routes,
  type AmortisationRow,
  type Loan,
  type PayoffQuote,
  type RepayLoanRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { LoanRepaymentService } from './loan-repayment.service.js';
import { LoanServicingService } from './loan-servicing.service.js';
import { LoanSettlementService } from './loan-settlement.service.js';
import { listLoansQuerySchema, type ListLoansQuery } from './loans.dto.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'loan';

@Controller()
@UseGuards(JwtAuthGuard)
export class LoansController {
  constructor(
    private readonly servicing: LoanServicingService,
    private readonly repayments: LoanRepaymentService,
    private readonly settlement: LoanSettlementService,
  ) {}

  @Get(routes.borrow.list)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listLoansQuerySchema)) query: ListLoansQuery,
  ): Promise<Loan[]> {
    return this.servicing.list(user.userId, query.status);
  }

  @Get(routes.borrow.byId(`:${ID_PARAM}`))
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) loanId: string,
  ): Promise<Loan> {
    return this.servicing.get(user.userId, loanId);
  }

  /** The instalment table, including what has been paid against each row. */
  @Get(routes.borrow.schedule(`:${ID_PARAM}`))
  async schedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) loanId: string,
  ): Promise<AmortisationRow[]> {
    return this.servicing.schedule(user.userId, loanId);
  }

  /**
   * Takes a repayment from a nominated account.
   *
   * Only what is owed is collected, so a customer who overshoots their settlement figure
   * is debited the settlement figure and no more.
   *
   * **`@Idempotent()`** — this route debits an account. A timed-out client that retries
   * without replay protection pays twice, and one that refuses to retry leaves the
   * customer unsure whether their loan was paid at all. The service is safe against a
   * replay on its own, but the edge is where the retry actually happens, so it is caught
   * there too.
   *
   * **`@Audited()`** — a repayment changes what a customer owes. Reconstructing a disputed
   * balance means being able to see every movement against it and who asked for it.
   */
  @Post(routes.borrow.repay(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audited({ action: 'loan.repay', entity: AUDIT_ENTITY })
  async repay(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) loanId: string,
    @Body(zodBody(repayLoanRequestSchema)) request: RepayLoanRequest,
  ): Promise<Loan> {
    return this.repayments.repay({ userId: user.userId, loanId, request });
  }

  /** What it would cost to clear this loan today, valid for the next hour. */
  @Get(routes.borrow.payoffQuote(`:${ID_PARAM}`))
  async payoffQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) loanId: string,
  ): Promise<PayoffQuote> {
    return this.settlement.payoffQuote(user.userId, loanId);
  }
}
