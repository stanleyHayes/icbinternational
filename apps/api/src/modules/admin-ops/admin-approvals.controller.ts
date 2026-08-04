import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import {
  ErrorCode,
  Permission,
  ApprovalStatus,
  decideApprovalRequestSchema,
  manualPostingRequestSchema,
  routes,
  type ApprovalRequest,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { fromWire } from '../../common/money/money.codec.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AdminEndpoint, CurrentAdmin, type AdminPrincipal } from '../rbac/index.js';

import { ApprovalStore } from './approval.store.js';

/** How long a pending request stays decidable before the initiator has to raise it again. */
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1_000;
const REQUEST_TTL_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

/**
 * Narrows an operator id to the prefixed form the contract requires.
 *
 * `AdminPrincipal.id` is a plain `string`; `approvalRequestSchema` wants `adm_…`. The
 * principal is built by `AdminAuthGuard` from a record whose id the seeder minted with that
 * prefix, so the shapes do agree — but a cast is a claim, and this is the one place the
 * claim is made rather than repeated at each of the three call sites.
 */
function asAdminId(id: string): `adm_${string}` {
  return id as `adm_${string}`;
}

/**
 * Admin dual-control: manual postings queue + approval decisions.
 *
 * A manual posting is a two-step process:
 * 1. An operator with `posting:initiate` submits the request → it lands in `PENDING`.
 * 2. A **different** operator with `posting:approve` decides `APPROVE` or `REJECT`.
 *
 * Self-approval is refused: if `initiatedBy.id === decidedBy.id`, the API returns 409.
 * Expired or already-decided requests are also immutable.
 */
@Controller()
export class AdminApprovalsController {
  constructor(
    private readonly store: ApprovalStore,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /** `POST /admin/manual-postings` — enqueue a manual posting for dual-control review. */
  @Post(routes.admin.manualPostings)
  @AdminEndpoint(Permission.POSTING_INITIATE)
  async createManualPosting(
    @Body(zodBody(manualPostingRequestSchema)) body: ReturnType<typeof manualPostingRequestSchema.parse>,
    @CurrentAdmin() admin: AdminPrincipal,
  ): Promise<ApprovalRequest> {
    const amount = fromWire(body.amount);
    const now = this.clock.now();
    const request: ApprovalRequest = {
      id: this.ids.generate('approval'),
      kind: 'MANUAL_POSTING',
      status: ApprovalStatus.PENDING,
      initiatedBy: { id: asAdminId(admin.id), name: admin.email },
      decidedBy: null,
      payload: { ...body },
      amount: { amount: amount.amount.toString(), currency: amount.currency },
      justification: body.justification,
      decisionNote: null,
      expiresAt: new Date(now.getTime() + REQUEST_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
      decidedAt: null,
    };
    this.store.insert(request);
    return request;
  }

  /** `GET /admin/approvals` — list all pending and decided approval requests. */
  @Get(routes.admin.approvals)
  @AdminEndpoint(Permission.POSTING_APPROVE)
  list(): { data: ApprovalRequest[] } {
    return { data: this.store.list() };
  }

  /** `POST /admin/approvals/:id/decide` — approve or reject a pending request. */
  @Post(routes.admin.decideApproval(':id'))
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.POSTING_APPROVE)
  decide(
    @Param('id') id: string,
    @Body(zodBody(decideApprovalRequestSchema)) body: ReturnType<typeof decideApprovalRequestSchema.parse>,
    @CurrentAdmin() admin: AdminPrincipal,
  ): ApprovalRequest {
    const request = this.store.findById(id);
    this.assertDecidable(id, request, admin);

    const decided = this.store.decide(
      id,
      { id: asAdminId(admin.id), name: admin.email },
      body.decision,
      body.note,
    );
    if (!decided) {
      throw new AppError({
        code: ErrorCode.CONFLICT,
        message: 'This request has already been decided.',
        context: { approvalId: id },
      });
    }
    return decided;
  }

  private assertDecidable(id: string, request: ApprovalRequest | undefined, admin: AdminPrincipal): asserts request is ApprovalRequest {
    if (!request) {
      throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'No approval with that reference.' });
    }
    if (request.initiatedBy.id === admin.id) {
      throw new AppError({
        code: ErrorCode.SELF_APPROVAL_FORBIDDEN,
        message: 'A manual posting must be approved by a second operator.',
        context: { approvalId: id, adminId: admin.id },
      });
    }
    if (Date.parse(request.expiresAt) <= this.clock.timestamp()) {
      throw new AppError({
        code: ErrorCode.PRECONDITION_FAILED,
        message: 'This request has expired. Ask the initiator to raise it again.',
        context: { approvalId: id, expiresAt: request.expiresAt },
      });
    }
  }
}
