/**
 * Underwriting, for staff.
 *
 * Permissioned on `loan:decide`, because every action here commits the bank to lend. The
 * referral queue is ordered by how long an applicant has been waiting rather than by id:
 * it is a work list, and a work list sorted by identifier is a work list nobody works
 * through in the right order.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { Permission, routes, type LoanApplication } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { Idempotent } from '../idempotency/index.js';
import { AdminEndpoint } from '../rbac/index.js';

import { toContractApplication } from './loan-application.mapper.js';
import { LoanApplicationService } from './loan-application.service.js';
import { LoanDecisionService } from './loan-decision.service.js';
import { loanDecisionRequestSchema, type LoanDecisionRequest } from './loans.dto.js';

const ID_PARAM = 'id';
const DECIDE_ROUTE = routes.admin.decideLoan(`:${ID_PARAM}`);

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'loanApplication';

@Controller()
@AdminEndpoint(Permission.LOAN_DECIDE)
export class AdminLoansController {
  constructor(
    private readonly applications: LoanApplicationService,
    private readonly decisions: LoanDecisionService,
  ) {}

  /** Applications waiting on an underwriter, longest wait first. */
  @Get(routes.admin.loanApplications)
  async queue(): Promise<LoanApplication[]> {
    return this.applications.listReferred();
  }

  /**
   * Approves or declines a referred application.
   *
   * An approval for less than was asked for is a first-class outcome, not a rejection: the
   * underwriter passes the figure they are willing to lend and the offer is rebuilt around
   * it at the same rate the scorecard produced.
   *
   * Audited without exception: an underwriting decision is the record the bank answers a
   * complaint or a regulator with, and it has to name the human who made it. Idempotent
   * because a retried decision would re-price a live offer under the customer.
   */
  @Post(DECIDE_ROUTE)
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audited({ action: 'loan.application.decide', entity: AUDIT_ENTITY })
  async decide(
    @Param(ID_PARAM) applicationId: string,
    @Body(zodBody(loanDecisionRequestSchema)) request: LoanDecisionRequest,
  ): Promise<LoanApplication> {
    return toContractApplication(await this.decisions.decideManually({ applicationId, request }));
  }
}
