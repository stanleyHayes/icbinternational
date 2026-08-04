/**
 * The analyst's KYC endpoints: the review queue, the file, and the decision.
 *
 * Everything here is staff-only behind the RBAC guard chain — `kyc:read` to look,
 * `kyc:decide` to settle — and everything that changes state is audited with the
 * analyst's identity on it. The single read of a customer's file is audited too
 * (risk #10): looking at an identity file is itself an act the bank must be able to
 * reconstruct.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { ErrorCode, KycStatus, Permission, routes, type KycCase } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AdminPrincipal } from '../rbac/admin-auth.types.js';
import { AdminEndpoint, CurrentAdmin } from '../rbac/index.js';

import { KycCaseRepository } from './kyc-case.repository.js';
import { type KycCaseDocument } from './kyc-case.schema.js';
import { KycDecisionService } from './kyc-decision.service.js';
import { KYC_AUDIT_CAPTURE_FIELDS, KYC_AUDIT_ENTITY } from './kyc.constants.js';
import {
  adminKycQueueQuerySchema,
  decideKycRequestSchema,
  type AdminKycQueueQuery,
  type DecideKycRequest,
} from './kyc.dto.js';
import { KycPresenter } from './kyc.presenter.js';

const CASE_ID_PARAM = 'id';

/** Statuses waiting on a human, in the order an analyst works them. */
const QUEUE_STATUSES = Object.freeze([
  KycStatus.UNDER_REVIEW,
  KycStatus.SUBMITTED,
  KycStatus.MORE_INFO_REQUIRED,
]);

@Controller()
export class AdminKycController {
  constructor(
    private readonly cases: KycCaseRepository,
    private readonly decision: KycDecisionService,
    private readonly presenter: KycPresenter,
  ) {}

  /** The review queue, oldest submission first. */
  @Get(routes.admin.kycQueue)
  @AdminEndpoint(Permission.KYC_READ)
  async queue(
    @Query(zodBody(adminKycQueueQuerySchema)) query: AdminKycQueueQuery,
  ): Promise<PageResult<KycCase>> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const records = await this.cases.findReviewQueue({
      statuses: query.status ? [query.status] : QUEUE_STATUSES,
      ...(after ? { submittedAfter: new Date(after.sortValue) } : {}),
      limit: query.limit + 1,
    });

    const page = buildPage({
      records,
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.submittedAt?.toISOString() ?? '', id: record.id }),
    });
    return {
      data: await Promise.all(page.data.map((record) => this.presenter.present(record))),
      page: page.page,
    };
  }

  /** One customer's file. Reading it is audited — an identity file is not browsed idly. */
  @Get(routes.admin.kycCase(`:${CASE_ID_PARAM}`))
  @AdminEndpoint(Permission.KYC_READ)
  @Audited({
    action: 'kyc.review.read',
    entity: KYC_AUDIT_ENTITY,
    entityIdFrom: `params.${CASE_ID_PARAM}`,
    captureFields: KYC_AUDIT_CAPTURE_FIELDS,
  })
  async getCase(@Param(CASE_ID_PARAM) caseId: string): Promise<KycCase> {
    return this.presenter.present(await this.requireCase(caseId));
  }

  /** Settles a case awaiting review. */
  @Post(routes.admin.decideKyc(`:${CASE_ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.KYC_DECIDE)
  @Audited({
    action: 'kyc.decide',
    entity: KYC_AUDIT_ENTITY,
    entityIdFrom: `params.${CASE_ID_PARAM}`,
    captureFields: KYC_AUDIT_CAPTURE_FIELDS,
    subjectLoader: KycCaseRepository,
  })
  async decide(
    @CurrentAdmin() admin: AdminPrincipal | undefined,
    @Param(CASE_ID_PARAM) caseId: string,
    @Body(zodBody(decideKycRequestSchema)) request: DecideKycRequest,
  ): Promise<KycCase> {
    return this.presenter.present(
      await this.decision.decideForAdmin(caseId, request, actorFrom(admin)),
    );
  }

  /** The case, or a 404 phrased for staff. */
  private async requireCase(caseId: string): Promise<KycCaseDocument> {
    const kycCase = await this.cases.findByCaseId(caseId);
    if (!kycCase) throw AppError.notFound('KYC case', caseId);
    return kycCase;
  }
}

/** The guard chain guarantees a principal; an absent one is a wiring defect, not a 401. */
function actorFrom(admin: AdminPrincipal | undefined): string {
  if (!admin) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'KYC decision endpoint reached without an authenticated admin',
    });
  }
  return admin.id;
}
