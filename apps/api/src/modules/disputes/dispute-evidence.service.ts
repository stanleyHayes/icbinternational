import { Injectable } from '@nestjs/common';

import { DisputeStatus, ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { DisputeQueryService } from './dispute-query.service.js';
import { DisputeStore, type DisputeRecord } from './dispute.store.js';
import { MAX_EVIDENCE_IDS } from './disputes.constants.js';
import { type AddDisputeEvidenceRequest } from './disputes.dto.js';
import { isOpenStatus, statusAfterEvidenceOn } from './domain/dispute-lifecycle.js';

/** Documents a customer is adding to a case they already raised. */
export interface AttachEvidenceInput {
  readonly userId: string;
  readonly disputeId: string;
  readonly request: AddDisputeEvidenceRequest;
}

/**
 * Attaching evidence after the case is open.
 *
 * Evidence is not a passive upload. Answering a representment is the act that takes a case
 * to arbitration under the scheme rules, so the status the documents land on is derived
 * from where the case stands rather than chosen by the caller — see
 * {@link statusAfterEvidenceOn}.
 *
 * Ids already on the case are dropped instead of rejected. A customer who resubmits the
 * form has not made a mistake worth an error page, and appending a duplicate would spend
 * one of their ten slots on a document already there.
 */
@Injectable()
export class DisputeEvidenceService {
  constructor(
    private readonly disputes: DisputeStore,
    private readonly queries: DisputeQueryService,
    private readonly clock: ClockService,
  ) {}

  async attach(input: AttachEvidenceInput): Promise<DisputeRecord> {
    const dispute = await this.queries.requireOwned(input.userId, input.disputeId);
    assertOpen(dispute);

    const added = input.request.evidenceIds.filter((id) => !dispute.evidenceIds.includes(id));
    if (added.length === 0) return dispute;
    assertFits(dispute, added.length);

    const status = statusAfterEvidenceOn(dispute.status);
    const at = this.clock.now();

    // Written even when it has not changed. `applyTransition` sends `set` straight into
    // `$set`, and MongoDB rejects an empty one — a case that stays where it is would
    // otherwise fail on the one path that does not move it.
    const updated = await this.disputes.applyTransition({
      id: dispute.id,
      set: { status },
      appendEvidenceIds: added,
      timelineEntry: {
        status,
        at,
        detail: input.request.note ?? describe(added.length, status),
      },
    });

    if (!updated) throw AppError.notFound('Dispute', dispute.id);
    return updated;
  }
}

function assertOpen(dispute: DisputeRecord): void {
  if (isOpenStatus(dispute.status)) return;

  throw AppError.conflict(
    ErrorCode.CONFLICT,
    `Dispute ${dispute.id} has been decided and stands at ${dispute.status}, so nothing ` +
      'further can be added to it.',
  );
}

function assertFits(dispute: DisputeRecord, adding: number): void {
  if (dispute.evidenceIds.length + adding <= MAX_EVIDENCE_IDS) return;

  throw AppError.validation(
    `A dispute carries at most ${MAX_EVIDENCE_IDS} documents, and this one already has ` +
      `${dispute.evidenceIds.length}.`,
    [{ path: 'evidenceIds', message: `Remove ${adding} of these and send the rest.` }],
  );
}

/** The history step, when the customer did not write one of their own. */
function describe(count: number, status: DisputeStatus): string {
  const noun = count === 1 ? 'a document' : `${count} documents`;
  return status === DisputeStatus.ARBITRATION
    ? `You sent ${noun} in answer to the merchant. The case has gone to arbitration.`
    : `You added ${noun} to your case.`;
}
