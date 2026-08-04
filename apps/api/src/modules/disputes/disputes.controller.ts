import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createDisputeRequestSchema,
  routes,
  type CreateDisputeRequest,
  type Dispute,
  type Paginated,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Idempotent } from '../idempotency/index.js';

import { DisputeEvidenceService } from './dispute-evidence.service.js';
import { DisputeQueryService } from './dispute-query.service.js';
import { DisputeRaiseService } from './dispute-raise.service.js';
import { DisputeResolutionService } from './dispute-resolution.service.js';
import { toContractDispute } from './dispute.mapper.js';
import { DisputeRepository } from './dispute.repository.js';
import { DISPUTE_AUDIT_CAPTURE_FIELDS, DISPUTE_AUDIT_ENTITY } from './disputes.constants.js';
import {
  addDisputeEvidenceRequestSchema,
  listDisputesQuerySchema,
  type AddDisputeEvidenceRequest,
  type ListDisputesQuery,
} from './disputes.dto.js';

/** Path parameter name, spelled once so the route constant and the decorator cannot drift. */
const ID_PARAM = 'id';

const DISPUTE_ROUTE = routes.support.dispute(`:${ID_PARAM}`);

/** Everything this controller writes is audited under the same entity family. */
const AUDIT = { entity: DISPUTE_AUDIT_ENTITY, captureFields: DISPUTE_AUDIT_CAPTURE_FIELDS };

/**
 * A customer's disputes: raising them, following them, and dropping them.
 *
 * `CsrfGuard` sits on the mutations only. These routes authenticate from a cookie, which
 * is exactly what a cross-site request can ride on, so every state change carries the
 * double-submit check — but a read cannot be weaponised that way and the client does not
 * send the header on one, so requiring it there would break the list rather than protect
 * it.
 *
 * Raising is `@Idempotent()` because a resubmitted form must resolve to the case that was
 * created rather than to a second one, and the provisional credit that comes with it must
 * be paid once. Withdrawing and attaching evidence are not: neither creates anything, and
 * both are naturally convergent — the same documents twice add nothing the second time.
 *
 * No handler here checks ownership. That rule lives in `DisputeQueryService`, so it holds
 * for every caller rather than for every caller who remembered.
 */
@Controller()
export class DisputesController {
  constructor(
    private readonly raising: DisputeRaiseService,
    private readonly queries: DisputeQueryService,
    private readonly evidence: DisputeEvidenceService,
    private readonly resolution: DisputeResolutionService,
  ) {}

  @Get(routes.support.disputes)
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listDisputesQuerySchema)) query: ListDisputesQuery,
  ): Promise<Paginated<Dispute>> {
    const page = await this.queries.listForCustomer(user.userId, query);
    return { data: page.data.map(toContractDispute), page: page.page };
  }

  /** Disputes a payment. The amount is credited back while the case runs. */
  @Post(routes.support.disputes)
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Idempotent()
  @Audited({ action: 'dispute.raise', subjectLoader: DisputeRepository, ...AUDIT })
  async raise(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createDisputeRequestSchema)) request: CreateDisputeRequest,
  ): Promise<Dispute> {
    return toContractDispute(await this.raising.raise({ userId: user.userId, request }));
  }

  @Get(DISPUTE_ROUTE)
  @UseGuards(JwtAuthGuard)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) disputeId: string,
  ): Promise<Dispute> {
    return toContractDispute(await this.queries.getForCustomer(user.userId, disputeId));
  }

  /**
   * Withdraws a dispute the customer no longer wants pursued.
   *
   * The provisional credit goes back with it. Leaving the money in place would let a case
   * be raised, credited and abandoned for profit, which is not a hole worth leaving open
   * for the sake of one fewer entry.
   */
  @Delete(DISPUTE_ROUTE)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'dispute.withdraw', subjectLoader: DisputeRepository, ...AUDIT })
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) disputeId: string,
  ): Promise<Dispute> {
    const dispute = await this.queries.requireOwned(user.userId, disputeId);
    return toContractDispute(await this.resolution.withdraw(dispute));
  }

  /** Attaches documents to an open case. */
  @Post(routes.support.disputeEvidence(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Audited({ action: 'dispute.evidence', subjectLoader: DisputeRepository, ...AUDIT })
  async addEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) disputeId: string,
    @Body(zodBody(addDisputeEvidenceRequestSchema)) request: AddDisputeEvidenceRequest,
  ): Promise<Dispute> {
    const updated = await this.evidence.attach({ userId: user.userId, disputeId, request });
    return toContractDispute(updated);
  }
}
