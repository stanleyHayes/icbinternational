import { Injectable, Logger } from '@nestjs/common';

import { DisputeStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { TransactionStore } from '../transactions/repositories/transaction.store.js';

import { formatDeadline, formatStoredAmount } from './dispute-format.js';
import { DisputeResolutionService } from './dispute-resolution.service.js';
import { DisputeStore, type DisputeRecord } from './dispute.store.js';
import { isMerchantResponseDue } from './domain/dispute-lifecycle.js';
import { DisputeNotifier } from './ports/dispute-notifier.port.js';
import { MerchantResponsePort, type MerchantResponse } from './ports/merchant-response.port.js';

/**
 * The scheme clock, evaluated when somebody looks at the case.
 *
 * The card network answers on its own schedule and the bank has no job queue watching for
 * it, so the merchant's reply lands the next time the dispute is read. Two properties keep
 * that honest rather than merely convenient:
 *
 * - **A read never changes a customer's balance.** The merchant either contests, which
 *   moves paper only, or accepts, which settles a won case — and a won case with a
 *   provisional credit moves value between general-ledger accounts, never the customer's.
 * - **A read never fails because the scheme did.** An answer that cannot be applied is
 *   logged and the case is returned as it stands. A customer opening their dispute list
 *   must not see an error because a settlement could not be booked behind it.
 *
 * Applying an answer twice is prevented by the statuses themselves: both destinations sit
 * outside {@link AWAITING_MERCHANT_STATUSES}, so the second reader finds nothing due. Two
 * readers racing the *first* answer converge anyway — the ledger's unique reference means
 * one entry exists however many callers ask for it.
 */
@Injectable()
export class DisputeProgressionService {
  private readonly logger = new Logger(DisputeProgressionService.name);

  constructor(
    private readonly disputes: DisputeStore,
    private readonly transactions: TransactionStore,
    private readonly merchant: MerchantResponsePort,
    private readonly resolution: DisputeResolutionService,
    private readonly notifier: DisputeNotifier,
    private readonly clock: ClockService,
  ) {}

  /** The case as it stands, having first let any overdue merchant answer land. */
  async advance(dispute: DisputeRecord): Promise<DisputeRecord> {
    const due = isMerchantResponseDue({
      status: dispute.status,
      merchantResponseDueAt: dispute.merchantResponseDueAt,
      now: this.clock.now(),
    });
    if (!due) return dispute;

    try {
      return await this.applyAnswer(dispute);
    } catch (error) {
      this.logger.error(`Dispute ${dispute.id} could not take the merchant's answer: ${error}`);
      return dispute;
    }
  }

  /**
   * The same, across a page.
   *
   * Sequential rather than concurrent: settling a case writes to the ledger, and a page of
   * parallel transactions competing for the suspense account would spend its time losing
   * write conflicts to itself.
   */
  async advanceAll(page: readonly DisputeRecord[]): Promise<DisputeRecord[]> {
    const advanced: DisputeRecord[] = [];
    for (const dispute of page) advanced.push(await this.advance(dispute));
    return advanced;
  }

  private async applyAnswer(dispute: DisputeRecord): Promise<DisputeRecord> {
    const answer = this.merchant.respond({
      disputeId: dispute.id,
      reason: dispute.reason,
      merchantName: await this.merchantNameFor(dispute),
      amountFormatted: formatStoredAmount(dispute.disputedAmount),
    });

    return answer.contestsLiability
      ? this.represent(dispute, answer)
      : this.upholdAgainstMerchant(dispute, answer);
  }

  /**
   * The merchant is fighting it.
   *
   * The case moves to representment and the customer is told, because this is the point at
   * which more evidence from them is worth something — answering a representment is what
   * takes a case to arbitration.
   */
  private async represent(
    dispute: DisputeRecord,
    answer: MerchantResponse,
  ): Promise<DisputeRecord> {
    const at = this.clock.now();
    const updated = await this.disputes.applyTransition({
      id: dispute.id,
      set: { status: DisputeStatus.REPRESENTED, merchantResponse: answer.responseText },
      timelineEntry: { status: DisputeStatus.REPRESENTED, at, detail: REPRESENTED_DETAIL },
    });
    if (!updated) return dispute;

    await this.notifier.disputeUpdated({
      userId: dispute.userId,
      reference: dispute.id,
      stage: REPRESENTED_STAGE,
      whatWeNeed: REPRESENTED_ASK,
      nextUpdateBy: formatDeadline(dispute.decisionDueAt),
    });

    return updated;
  }

  /** The merchant conceded. Nothing is left to investigate, so the case is won. */
  private async upholdAgainstMerchant(
    dispute: DisputeRecord,
    answer: MerchantResponse,
  ): Promise<DisputeRecord> {
    return this.resolution.resolve({
      dispute,
      outcome: DisputeStatus.WON,
      outcomeSummary: ACCEPTED_SUMMARY,
      reverseProvisionalCredit: false,
      merchantResponse: answer.responseText,
    });
  }

  /**
   * Who the customer paid, in the words their statement uses.
   *
   * Read from the transaction rather than stored on the case: the dispute document points
   * at the movement it contests, and duplicating the merchant's name would give the bank
   * two versions of it to disagree about.
   */
  private async merchantNameFor(dispute: DisputeRecord): Promise<string> {
    const transaction = await this.transactions.findByPublicId(dispute.transactionId);
    return transaction?.counterparty?.name ?? transaction?.description ?? UNNAMED_MERCHANT;
  }
}

const REPRESENTED_DETAIL = 'The merchant has sent us their evidence. We are reviewing it.';
const REPRESENTED_STAGE = 'The merchant has sent us their evidence';
const REPRESENTED_ASK = 'Anything further that supports your claim, if you have it.';

const ACCEPTED_SUMMARY =
  'The merchant accepted liability and did not contest the claim, so the credit in your ' +
  'account is yours to keep.';

/** Shown when the movement carries no counterparty at all — rare, but not impossible. */
const UNNAMED_MERCHANT = 'the merchant';
