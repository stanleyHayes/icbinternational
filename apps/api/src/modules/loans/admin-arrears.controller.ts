/**
 * Collections, for staff.
 *
 * The three things an agent can do to a loan in difficulty: agree an arrangement,
 * restructure the contract, or write the balance off. All three are permissioned on
 * `loan:decide` and all three record a reason, because each of them is a decision the bank
 * has to be able to justify years later.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { Permission, routes, type Loan } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { Idempotent } from '../idempotency/index.js';
import { AdminEndpoint } from '../rbac/index.js';

import { toArrearsView, type ArrearsView } from './loan-arrears.mapper.js';
import { LoanArrearsService } from './loan-arrears.service.js';
import { LoanCollectionsService } from './loan-collections.service.js';
import { LoanSettlementService } from './loan-settlement.service.js';
import {
  arrearsQuerySchema,
  paymentPlanRequestSchema,
  restructureLoanRequestSchema,
  writeOffRequestSchema,
  type ArrearsQuery,
  type PaymentPlanRequest,
  type RestructureLoanRequest,
  type WriteOffRequest,
} from './loans.dto.js';

const ID_PARAM = 'id';
const LOAN_ROUTE = `${routes.admin.arrears}/:${ID_PARAM}`;
const SWEEP_ROUTE = `${routes.admin.arrears}/sweep`;
const WRITE_OFF_ROUTE = `${LOAN_ROUTE}/write-off`;
const PAYMENT_PLAN_ROUTE = `${LOAN_ROUTE}/payment-plan`;
const RESTRUCTURE_ROUTE = `${LOAN_ROUTE}/restructure`;

/** Audit entity family for every event this controller emits. */
const AUDIT_ENTITY = 'loan';

@Controller()
@AdminEndpoint(Permission.LOAN_DECIDE)
export class AdminArrearsController {
  constructor(
    private readonly arrears: LoanArrearsService,
    private readonly collections: LoanCollectionsService,
    private readonly settlement: LoanSettlementService,
  ) {}

  /** The collections queue, worst first, optionally narrowed to one arrears bucket. */
  @Get(routes.admin.arrears)
  async queue(@Query(zodBody(arrearsQuerySchema)) query: ArrearsQuery): Promise<ArrearsView[]> {
    const positions = await this.arrears.listArrears(query.bucket);
    return positions.map((position) => toArrearsView(position));
  }

  /**
   * Runs the arrears sweep for the current business date.
   *
   * Idempotent per loan per date, so running it twice does nothing the second time. That
   * is what makes it safe to expose as a button as well as a scheduled job.
   *
   * Audited rather than idempotent: the per-date guard already makes a second run a no-op,
   * and a batch run has no single entity a replay key would key on. What matters is that
   * the run is attributable to whoever pressed the button.
   */
  @Post(SWEEP_ROUTE)
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'loan.arrears.sweep', entity: AUDIT_ENTITY })
  async sweep(): Promise<{ assessed: number }> {
    return { assessed: await this.arrears.sweep() };
  }

  /** Agrees an arrangement to clear arrears in instalments. */
  @Post(PAYMENT_PLAN_ROUTE)
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @Audited({ action: 'loan.paymentPlan.agree', entity: AUDIT_ENTITY })
  async paymentPlan(
    @Param(ID_PARAM) loanId: string,
    @Body(zodBody(paymentPlanRequestSchema)) request: PaymentPlanRequest,
  ): Promise<Loan> {
    return this.collections.agreePaymentPlan(loanId, request);
  }

  /** Changes the remaining term by agreement, holding the rate. */
  @Post(RESTRUCTURE_ROUTE)
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audited({ action: 'loan.restructure', entity: AUDIT_ENTITY })
  async restructure(
    @Param(ID_PARAM) loanId: string,
    @Body(zodBody(restructureLoanRequestSchema)) request: RestructureLoanRequest,
  ): Promise<Loan> {
    return this.settlement.restructure(loanId, request);
  }

  /** Writes off a loan that is at least ninety days past due. */
  @Post(WRITE_OFF_ROUTE)
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audited({ action: 'loan.writeOff', entity: AUDIT_ENTITY })
  async writeOff(
    @Param(ID_PARAM) loanId: string,
    @Body(zodBody(writeOffRequestSchema)) request: WriteOffRequest,
  ): Promise<Loan> {
    return this.collections.writeOff(loanId, request);
  }
}
