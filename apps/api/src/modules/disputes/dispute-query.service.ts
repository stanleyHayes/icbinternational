import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';
import { type PageResult } from '../../common/pagination/cursor.js';

import { DisputeProgressionService } from './dispute-progression.service.js';
import { DisputeStore, type DisputeListQuery, type DisputeRecord } from './dispute.store.js';
import { type ListDisputesQuery } from './disputes.dto.js';

/**
 * Reading disputes, and the one rule every read obeys.
 *
 * A customer sees their own cases and nothing else, and that is enforced here rather than
 * in a controller: the customer list is scoped in the query itself, so a case belonging to
 * somebody else never matches, and the single-case read compares the owner before
 * returning. Putting the check at the route would make it a decorator someone can forget;
 * putting it here means every present and future caller inherits it.
 *
 * A dispute that exists but belongs to another customer answers 404, deliberately
 * indistinguishable from one that does not exist. A 403 would confirm the case is real,
 * which is an enumeration oracle over every dispute in the bank.
 *
 * Every read runs through {@link DisputeProgressionService} first, so a merchant answer
 * that came due since the last look has landed before anybody sees the case.
 */
@Injectable()
export class DisputeQueryService {
  constructor(
    private readonly disputes: DisputeStore,
    private readonly progression: DisputeProgressionService,
  ) {}

  /** The customer's own cases, newest first. */
  async listForCustomer(
    userId: string,
    query: ListDisputesQuery,
  ): Promise<PageResult<DisputeRecord>> {
    const page = await this.disputes.listForUser({ userId, ...toStoreQuery(query) });
    return { data: await this.progression.advanceAll(page.data), page: page.page };
  }

  /** The operations queue: every customer, longest-waiting case first. */
  async listForAdmin(query: ListDisputesQuery): Promise<PageResult<DisputeRecord>> {
    const page = await this.disputes.listForAdmin(toStoreQuery(query));
    return { data: await this.progression.advanceAll(page.data), page: page.page };
  }

  /** One of the customer's own cases. */
  async getForCustomer(userId: string, disputeId: string): Promise<DisputeRecord> {
    return this.progression.advance(await this.requireOwned(userId, disputeId));
  }

  /** One case, from the bank's side. No ownership test — staff work every customer. */
  async getForAdmin(disputeId: string): Promise<DisputeRecord> {
    const record = await this.disputes.findByPublicId(disputeId);
    if (!record) throw notFound(disputeId);
    return this.progression.advance(record);
  }

  /**
   * The record behind a route parameter, proven to belong to the caller.
   *
   * Returned rather than merely asserted so the services that act on a case — evidence,
   * withdrawal — take the ownership check and the load in one step and cannot end up
   * acting on a record they proved nothing about.
   */
  async requireOwned(userId: string, disputeId: string): Promise<DisputeRecord> {
    const record = await this.disputes.findByPublicId(disputeId);
    if (!record || record.userId !== userId) throw notFound(disputeId);
    return record;
  }
}

/**
 * Contract query to store query.
 *
 * The keys are omitted rather than passed as `undefined`: `exactOptionalPropertyTypes` is
 * off in this project, so an explicit undefined would type-check and then reach Mongo as
 * `{ status: undefined }`, which matches documents missing the field rather than matching
 * everything.
 */
function toStoreQuery(query: ListDisputesQuery): DisputeListQuery {
  return {
    limit: query.limit,
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  };
}

function notFound(disputeId: string): AppError {
  return AppError.notFound('Dispute', disputeId);
}
