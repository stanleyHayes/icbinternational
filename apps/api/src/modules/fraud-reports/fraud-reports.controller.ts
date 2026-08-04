import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';

import {
  createFraudReportRequestSchema,
  cursorQuerySchema,
  routes,
  type CreateFraudReportRequest,
  type CursorQuery,
  type FraudReport,
  type Paginated,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import {
  FRAUD_REPORT_AUDIT_CAPTURE_FIELDS,
  FRAUD_REPORT_AUDIT_ENTITY,
} from './fraud-report.constants.js';
import { toContractFraudReport } from './fraud-report.mapper.js';
import { FraudReportRepository } from './fraud-report.repository.js';
import { FraudReportService } from './fraud-report.service.js';

const AUDIT = {
  entity: FRAUD_REPORT_AUDIT_ENTITY,
  captureFields: FRAUD_REPORT_AUDIT_CAPTURE_FIELDS,
};

@Controller()
export class FraudReportsController {
  constructor(private readonly reports: FraudReportService) {}

  @Get(routes.support.fraudReports)
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(cursorQuerySchema)) query: CursorQuery,
  ): Promise<Paginated<FraudReport>> {
    return this.reports.list(user.userId, query);
  }

  @Post(routes.support.fraudReports)
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Idempotent()
  @Audited({ action: 'fraud-report.create', subjectLoader: FraudReportRepository, ...AUDIT })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createFraudReportRequestSchema)) request: CreateFraudReportRequest,
  ): Promise<FraudReport> {
    return toContractFraudReport(await this.reports.create({ userId: user.userId, request }));
  }
}
