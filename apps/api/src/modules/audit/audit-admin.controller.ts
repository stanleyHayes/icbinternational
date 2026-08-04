import { Controller, Get, Query } from '@nestjs/common';

import {
  Permission,
  auditQuerySchema,
  routes,
  type AuditEvent,
  type Paginated,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AdminEndpoint } from '../rbac/index.js';

import { AuditEventRepository, type AuditEventQuery } from './audit-event.repository.js';
import { AuditVerifierService } from './audit-verifier.service.js';
import { toContract } from './audit.mapper.js';

type AuditQueryInput = {
  cursor?: string;
  limit: number;
  actorId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
};

/**
 * Read-only window into the audit trail for the operations console.
 *
 * The append-only chain is already enforced at the repository layer — nothing here writes.
 * Verification is a heavy operation (full sequential scan) so it is guarded with
 * `AUDIT_READ`, the narrowest permission that still limits it to auditors and admins.
 */
@Controller()
export class AuditAdminController {
  constructor(
    private readonly events: AuditEventRepository,
    private readonly verifier: AuditVerifierService,
    private readonly clock: ClockService,
  ) {}

  @Get(routes.admin.audit)
  @AdminEndpoint(Permission.AUDIT_READ)
  async list(
    @Query(zodBody(auditQuerySchema)) query: AuditQueryInput,
  ): Promise<Paginated<AuditEvent>> {
    const params: AuditEventQuery = {
      cursor: query.cursor,
      limit: query.limit,
      actorId: query.actorId,
      entity: query.entity,
      entityId: query.entityId,
      action: query.action,
      from: query.from,
      to: query.to,
    };

    const docs = await this.events.query(params);
    const nextDoc = docs[docs.length - 1];

    return {
      data: docs.map((doc) => toContract(doc)),
      page: {
        cursor: nextDoc ? String(nextDoc.sequence) : null,
        limit: query.limit,
        hasMore: docs.length === query.limit,
      },
    };
  }

  /** Walks the full chain and reports the first broken link, if any. */
  @Get(routes.admin.verifyAuditChain)
  @AdminEndpoint(Permission.AUDIT_READ)
  async verify(): Promise<{ data: { verified: boolean; eventsChecked: number; firstBrokenSequence: number | null; checkedAt: string } }> {
    const result = await this.verifier.verify();
    return {
      data: {
        verified: result.verified,
        eventsChecked: result.eventsChecked,
        firstBrokenSequence: result.firstBrokenSequence ?? null,
        checkedAt: this.clock.now().toISOString(),
      },
    };
  }
}
