import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';

import { ErrorCode, routes } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import {
  BusinessStore,
  type BusinessApproval,
  type BusinessInvoice,
  type BusinessMember,
  type PayrollRun,
} from './business.store.js';

/**
 * Business banking: multi-user account surface.
 *
 * Routes cover:
 * - Members (list, get)
 * - Approvals (list, decide)
 * - Invoices (list, get)
 * - Payroll runs (list + submit)
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class BusinessController {
  private static readonly ISO_DATE_LENGTH = 10;
  constructor(
    private readonly store: BusinessStore,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  // --- Members ----------------------------------------------------------------

  /** `GET /business/members` */
  @Get(routes.business.members)
  listMembers(): { data: BusinessMember[] } {
    return { data: this.store.listMembers() };
  }

  /** `GET /business/members/:id` */
  @Get(routes.business.member(':id'))
  getMember(@Param('id') id: string): BusinessMember {
    const member = this.store.findMember(id);
    if (!member) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'Member not found' });
    return member;
  }

  // --- Approvals -------------------------------------------------------------

  /** `GET /business/approvals` */
  @Get(routes.business.approvals)
  listApprovals(): { data: BusinessApproval[] } {
    return { data: this.store.listApprovals() };
  }

  /** `POST /business/approvals/:id/decide` — approve or reject a pending business action. */
  @Post(routes.business.decideApproval(':id'))
  @HttpCode(HttpStatus.OK)
  decide(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT' },
    @CurrentUser() user: AuthenticatedUser,
  ): BusinessApproval {
    const approval = this.store.findApproval(id);
    if (!approval) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'Approval not found' });
    if (approval.status !== 'PENDING') {
      throw new AppError({ code: ErrorCode.CONFLICT, message: 'Approval has already been decided' });
    }
    const updated = this.store.patchApproval(id, {
      status: body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      decidedAt: this.clock.now().toISOString(),
      decidedById: user.userId,
    });
    if (!updated) {
      throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'Approval not found' });
    }
    return updated;
  }

  // --- Invoices --------------------------------------------------------------

  /** `GET /business/invoices` */
  @Get(routes.business.invoices)
  listInvoices(): { data: BusinessInvoice[] } {
    return { data: this.store.listInvoices() };
  }

  /** `GET /business/invoices/:id` */
  @Get(routes.business.invoice(':id'))
  getInvoice(@Param('id') id: string): BusinessInvoice {
    const invoice = this.store.findInvoice(id);
    if (!invoice) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'Invoice not found' });
    return invoice;
  }

  // --- Payroll ---------------------------------------------------------------

  /**
   * `POST /business/payroll` — submit a new payroll run for approval.
   *
   * Accepts a JSON body with `periodStart`, `periodEnd`, `employeeCount`,
   * `totalAmount` and `currency`. Returns the created payroll run record.
   */
  @Post(routes.business.payroll)
  createPayrollRun(
    @Body() body: Record<string, unknown>,
    @CurrentUser() _user: AuthenticatedUser,
  ): PayrollRun {
    const id = this.ids.generate('payroll' as never);
    const today = this.clock.now().toISOString().slice(0, BusinessController.ISO_DATE_LENGTH);
    const run: PayrollRun = {
      id,
      periodStart: (body.periodStart as string) ?? today,
      periodEnd: (body.periodEnd as string) ?? today,
      employeeCount: (body.employeeCount as number) ?? 0,
      totalAmount: (body.totalAmount as string) ?? '0',
      currency: (body.currency as string) ?? 'GBP',
      status: 'SUBMITTED',
      createdAt: this.clock.now().toISOString(),
      processedAt: null,
    };
    this.store.insertPayrollRun(run);
    return run;
  }
}
