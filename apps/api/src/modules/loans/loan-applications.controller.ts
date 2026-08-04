/**
 * Applying to borrow: the indicative check, the application itself, and acceptance.
 *
 * Registered before {@link LoansController} because `/loans/applications` and
 * `/loans/eligibility` would otherwise be matched by that controller's `/loans/:id`
 * pattern and answered with "no such loan". Nest resolves routes in registration order, so
 * the more specific paths have to be declared first.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { routes, type Loan, type LoanApplication, type LoanEligibility } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { LoanApplicationService } from './loan-application.service.js';
import { LoanDisbursementService } from './loan-disbursement.service.js';
import { LoanQuoteService } from './loan-quote.service.js';
import {
  createApplicationRequestSchema,
  loanEligibilityRequestSchema,
  submitDocumentsRequestSchema,
  type CreateApplicationRequest,
  type LoanEligibilityRequest,
  type SubmitDocumentsRequest,
} from './loans.dto.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

/** The application path with its parameter placeholder, and the two paths built onto it. */
const APPLICATION_ROUTE = routes.borrow.application(`:${ID_PARAM}`);
const DOCUMENTS_ROUTE = `${APPLICATION_ROUTE}/documents`;
const WITHDRAW_ROUTE = `${APPLICATION_ROUTE}/withdraw`;

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'loanApplication';

@Controller()
@UseGuards(JwtAuthGuard)
export class LoanApplicationsController {
  constructor(
    private readonly applications: LoanApplicationService,
    private readonly quotes: LoanQuoteService,
    private readonly disbursement: LoanDisbursementService,
  ) {}

  /**
   * An indicative decision, priced on the customer's own profile.
   *
   * Nothing is recorded and nothing is promised. The binding version is the offer that
   * comes out of an application, assessed on the same scorecard once documents are in.
   */
  @Post(routes.borrow.eligibility)
  @HttpCode(HttpStatus.OK)
  async eligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(loanEligibilityRequestSchema)) request: LoanEligibilityRequest,
  ): Promise<LoanEligibility> {
    return this.quotes.assess(user.userId, request);
  }

  @Get(routes.borrow.applications)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<LoanApplication[]> {
    return this.applications.list(user.userId);
  }

  /**
   * Starts an application.
   *
   * **`@Idempotent()`** — a retried submission would open a second application against the
   * same customer, and a duplicate application is a second credit-file footprint they did
   * not ask for. **`@Audited()`** — a lending decision has to be explainable years later,
   * which starts with what was declared and when.
   */
  @Post(routes.borrow.applications)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'loan.application.create', entity: AUDIT_ENTITY })
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createApplicationRequestSchema)) request: CreateApplicationRequest,
  ): Promise<LoanApplication> {
    return this.applications.create(user.userId, request);
  }

  @Get(APPLICATION_ROUTE)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) applicationId: string,
  ): Promise<LoanApplication> {
    return this.applications.get(user.userId, applicationId);
  }

  /** Records supplied documents and re-decides on the spot. */
  @Post(DOCUMENTS_ROUTE)
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'loan.application.documents', entity: AUDIT_ENTITY })
  async documents(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) applicationId: string,
    @Body(zodBody(submitDocumentsRequestSchema)) request: SubmitDocumentsRequest,
  ): Promise<LoanApplication> {
    return this.applications.submitDocuments({ userId: user.userId, applicationId, request });
  }

  /** Withdraws an application the customer no longer wants to pursue. */
  @Post(WITHDRAW_ROUTE)
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'loan.application.withdraw', entity: AUDIT_ENTITY })
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) applicationId: string,
  ): Promise<LoanApplication> {
    return this.applications.withdraw(user.userId, applicationId);
  }

  /**
   * Accepts a live offer and draws it down in the same step.
   *
   * **`@Idempotent()`** — this is the request that puts money in an account, so it is the
   * one a client must be able to retry safely. The service claims the offer atomically and
   * would refuse the second attempt, but refusing a retry with `CONFLICT` is a worse answer
   * than replaying the first one's response. **`@Audited()`** — drawdown is the moment the
   * bank commits to lend.
   */
  @Post(routes.borrow.acceptOffer(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'loan.offer.accept', entity: AUDIT_ENTITY })
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) applicationId: string,
  ): Promise<Loan> {
    return this.disbursement.acceptOffer(user.userId, applicationId);
  }
}
