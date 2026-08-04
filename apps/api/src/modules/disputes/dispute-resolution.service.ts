import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { DisputeStatus, ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { fromStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import { formatStoredAmount } from './dispute-format.js';
import { DisputePoster } from './dispute.poster.js';
import { DisputeStore, type DisputeRecord } from './dispute.store.js';
import { DISPUTE_TRANSACTION_LABEL } from './disputes.constants.js';
import { type DecideDisputeRequest } from './disputes.dto.js';
import { isOpenStatus } from './domain/dispute-lifecycle.js';
import { DisputeNotifier } from './ports/dispute-notifier.port.js';

/** A decision on a case, whoever reached it. */
export interface ResolveDisputeInput {
  readonly dispute: DisputeRecord;
  readonly outcome: DecideDisputeRequest['outcome'];
  readonly outcomeSummary: string;
  /** Ignored when no provisional credit was given. */
  readonly reverseProvisionalCredit: boolean;
  /** The merchant's statement, when their answer settled the case in the same step. */
  readonly merchantResponse?: string;
}

/**
 * Closing a dispute, and the money that closing it moves.
 *
 * One path for every outcome, whether the decision came from an investigator, from the
 * customer withdrawing, or from the merchant accepting liability — because the accounting
 * a decision owes is a property of the decision, not of who reached it. Three ways to
 * close a case would be three places for the suspense account to be left dirty.
 *
 * The ledger work and the state change share one transaction. A case marked `LOST` whose
 * provisional credit is still sitting in the customer's balance is the failure mode this
 * prevents, and it is the expensive one: nobody notices until reconciliation.
 *
 * The notification is sent afterwards, deliberately outside the transaction. A decision
 * that moved real money must not roll back because an email provider is unavailable.
 */
@Injectable()
export class DisputeResolutionService {
  constructor(
    private readonly disputes: DisputeStore,
    private readonly poster: DisputePoster,
    private readonly notifier: DisputeNotifier,
    private readonly runner: TransactionRunner,
  ) {}

  async resolve(input: ResolveDisputeInput): Promise<DisputeRecord> {
    assertOpen(input.dispute);

    const resolved = await this.runner.run((session) => this.settle(input, session), {
      label: DISPUTE_TRANSACTION_LABEL.RESOLVE,
    });

    await this.notifier.disputeResolved({
      userId: resolved.userId,
      reference: resolved.id,
      amountFormatted: formatStoredAmount(resolved.disputedAmount),
      upheld: resolved.status === DisputeStatus.WON,
      explanation: input.outcomeSummary,
    });

    return resolved;
  }

  /** The customer dropping their own case. Any provisional credit goes straight back. */
  async withdraw(dispute: DisputeRecord): Promise<DisputeRecord> {
    return this.resolve({
      dispute,
      outcome: DisputeStatus.WITHDRAWN,
      outcomeSummary: WITHDRAWN_SUMMARY,
      reverseProvisionalCredit: true,
    });
  }

  /** Books the outcome, then records it. Both inside `session` or neither at all. */
  private async settle(input: ResolveDisputeInput, session: ClientSession): Promise<DisputeRecord> {
    const booked = await this.book(input, session);
    const at = this.poster.now();

    const updated = await this.disputes.applyTransition(
      {
        id: input.dispute.id,
        set: {
          status: input.outcome,
          outcomeSummary: input.outcomeSummary,
          resolvedAt: at,
          ...(booked.resolutionEntryId ? { resolutionEntryId: booked.resolutionEntryId } : {}),
          // Cleared rather than kept, because the client renders a non-null provisional
          // credit as money the customer currently has. After a reversal they do not.
          ...(booked.creditReversed ? { provisionalCredit: null, provisionalCreditAt: null } : {}),
          ...(input.merchantResponse ? { merchantResponse: input.merchantResponse } : {}),
        },
        timelineEntry: { status: input.outcome, at, detail: detailFor(input, booked) },
      },
      session,
    );

    if (!updated) throw AppError.notFound('Dispute', input.dispute.id);
    return updated;
  }

  /**
   * The journal entries the outcome owes.
   *
   * A won case always settles: either the scheme's recovery clears the suspense the
   * provisional credit parked, or it funds a payout to a customer who never had one. A
   * case that ends any other way only has work to do if a credit is outstanding.
   */
  private async book(input: ResolveDisputeInput, session: ClientSession): Promise<BookedOutcome> {
    const { dispute } = input;

    if (input.outcome === DisputeStatus.WON) {
      return { resolutionEntryId: await this.poster.settleWon(dispute, session), ...KEPT };
    }

    const parked = dispute.provisionalCredit;
    const creditEntryId = dispute.provisionalCreditEntryId;
    if (!parked || !creditEntryId) return { resolutionEntryId: null, ...KEPT };

    if (!input.reverseProvisionalCredit) {
      const absorbed = await this.poster.absorbLoss(dispute, fromStored(parked), session);
      return { resolutionEntryId: absorbed, ...KEPT };
    }

    await this.poster.reverseProvisionalCredit(creditEntryId, reversalReason(input), session);
    return { resolutionEntryId: null, creditReversed: true };
  }
}

/** What the ledger did, as the state change needs to know it. */
interface BookedOutcome {
  readonly resolutionEntryId: string | null;
  readonly creditReversed: boolean;
}

const KEPT = { creditReversed: false } as const;

const WITHDRAWN_SUMMARY = 'You asked us to stop investigating this payment.';

function assertOpen(dispute: DisputeRecord): void {
  if (isOpenStatus(dispute.status)) return;

  throw AppError.conflict(
    ErrorCode.CONFLICT,
    `Dispute ${dispute.id} has already been decided and stands at ${dispute.status}.`,
  );
}

/** Recorded on the reversing entry and shown beside it on the statement. */
function reversalReason(input: ResolveDisputeInput): string {
  return input.outcome === DisputeStatus.WITHDRAWN
    ? `Dispute ${input.dispute.id} withdrawn`
    : `Dispute ${input.dispute.id} not upheld`;
}

/** The history step, worded as the customer will read it. */
function detailFor(input: ResolveDisputeInput, booked: BookedOutcome): string {
  if (input.outcome === DisputeStatus.WON) {
    return 'Upheld. The credit in your account is now permanent.';
  }
  if (input.outcome === DisputeStatus.WITHDRAWN) {
    return booked.creditReversed
      ? 'Withdrawn at your request. The provisional credit has been taken back.'
      : 'Withdrawn at your request.';
  }
  return booked.creditReversed
    ? 'Not upheld. The provisional credit has been taken back.'
    : 'Not upheld. We have left the credit with you.';
}
