/**
 * The dispute queue, for staff.
 *
 * Permissioned on `dispute:manage`, because every decision here either keeps a customer's
 * money with them or takes it back. The queue is ordered oldest case first rather than by
 * identifier: a work list sorted by id is a work list nobody works in the right order, and
 * a dispute has a regulatory clock the bank is measured against.
 *
 * Deciding is `@Idempotent()` and `@Audited()`, and both are load-bearing. A replayed
 * decision would reverse a provisional credit twice; an unattributed one leaves the bank
 * unable to say who decided, which is the first question asked when a customer complains
 * about the answer they got.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { Permission, routes, type Dispute, type Paginated } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { Idempotent } from '../idempotency/index.js';
import { AdminEndpoint } from '../rbac/index.js';

import { DisputeQueryService } from './dispute-query.service.js';
import { DisputeResolutionService } from './dispute-resolution.service.js';
import { toContractDispute } from './dispute.mapper.js';
import { DisputeRepository } from './dispute.repository.js';
import { DISPUTE_AUDIT_CAPTURE_FIELDS, DISPUTE_AUDIT_ENTITY } from './disputes.constants.js';
import {
  decideDisputeRequestSchema,
  listDisputesQuerySchema,
  type DecideDisputeRequest,
  type ListDisputesQuery,
} from './disputes.dto.js';

const ID_PARAM = 'id';

const DISPUTE_ROUTE = routes.admin.dispute(`:${ID_PARAM}`);

@Controller()
@AdminEndpoint(Permission.DISPUTE_MANAGE)
export class AdminDisputesController {
  constructor(
    private readonly queries: DisputeQueryService,
    private readonly resolution: DisputeResolutionService,
  ) {}

  /** Every customer's cases, longest-waiting first. */
  @Get(routes.admin.disputes)
  async queue(
    @Query(zodBody(listDisputesQuerySchema)) query: ListDisputesQuery,
  ): Promise<Paginated<Dispute>> {
    const page = await this.queries.listForAdmin(query);
    return { data: page.data.map(toContractDispute), page: page.page };
  }

  @Get(DISPUTE_ROUTE)
  async get(@Param(ID_PARAM) disputeId: string): Promise<Dispute> {
    return toContractDispute(await this.queries.getForAdmin(disputeId));
  }

  /**
   * Decides a case.
   *
   * Won settles the chargeback against the scheme and the customer's credit becomes
   * permanent. Lost takes the credit back unless the investigator says otherwise, in which
   * case the bank absorbs it onto its own expense line rather than leaving the money
   * unexplained in suspense.
   */
  @Post(DISPUTE_ROUTE)
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audited({
    action: 'dispute.decide',
    entity: DISPUTE_AUDIT_ENTITY,
    subjectLoader: DisputeRepository,
    captureFields: DISPUTE_AUDIT_CAPTURE_FIELDS,
  })
  async decide(
    @Param(ID_PARAM) disputeId: string,
    @Body(zodBody(decideDisputeRequestSchema)) request: DecideDisputeRequest,
  ): Promise<Dispute> {
    const dispute = await this.queries.getForAdmin(disputeId);
    return toContractDispute(await this.resolution.resolve({ dispute, ...request }));
  }
}
