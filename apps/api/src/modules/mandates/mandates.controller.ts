import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { MandateStatus, entityId, routes, type Mandate, type Paginated } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { toContractMandate } from './mandate.mapper.js';
import { MandateService } from './mandate.service.js';

const ID_PARAM = 'id';
const AUDIT_ENTITY = 'mandate';

/**
 * The body of a mandate update.
 *
 * Declared here rather than imported: the frozen contract carries the route
 * (`PATCH /mandates/:id`) and the `MandateStatus` enum, but never named a request schema for
 * the update. `docs/HANDOFFS.md` carries the request to promote it into
 * `packages/contracts`.
 */
export const updateMandateBodySchema = z.object({
  status: z.enum([MandateStatus.ACTIVE, MandateStatus.PAUSED, MandateStatus.CANCELLED]),
});

/** The list filter, matching the fields the mock handlers already accept. */
export const listMandatesQuerySchema = z.object({
  status: z.enum(MandateStatus).optional(),
  accountId: entityId('acc').optional(),
});

/**
 * The customer's standing authorities.
 *
 * There is no create route, and that is correct rather than missing. A direct debit mandate
 * is set up by the *merchant* through the scheme — the customer gives their details to the
 * gym, and the gym lodges the authority — so `MandateService.setUp` is the bank's internal
 * entry point and the customer's surface is the three things they actually control: seeing
 * what is set up, pausing it, and cancelling it.
 *
 * Cancelling is one `PATCH` away and needs no reason, no notice and nobody's agreement. A
 * bank that made stopping a payment harder than starting one would be telling on itself.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class MandatesController {
  constructor(private readonly mandates: MandateService) {}

  @Get(routes.payments.mandates)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listMandatesQuerySchema))
    query: { status?: MandateStatus; accountId?: string },
  ): Promise<Paginated<Mandate>> {
    const records = await this.mandates.list({ userId: user.userId, ...query });
    const data = records.map((record) => toContractMandate(record));

    return { data, page: { cursor: null, limit: data.length, hasMore: false, total: data.length } };
  }

  @Get(routes.payments.mandate(`:${ID_PARAM}`))
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) mandateId: string,
  ): Promise<Mandate> {
    return toContractMandate(await this.mandates.get(user.userId, mandateId));
  }

  /** Pauses, restarts or cancels the authority. Cancelling is immediate and final. */
  @Patch(routes.payments.mandate(`:${ID_PARAM}`))
  @Audited({ action: 'mandate.update', entity: AUDIT_ENTITY, entityIdFrom: 'params.id' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) mandateId: string,
    @Body(zodBody(updateMandateBodySchema)) body: { status: MandateStatus },
  ): Promise<Mandate> {
    const updated = await this.mandates.setStatus({
      userId: user.userId,
      mandateId,
      status: body.status,
    });

    return toContractMandate(updated);
  }
}
