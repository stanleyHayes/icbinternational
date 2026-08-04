import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';
import { PostingService } from '../ledger/posting.service.js';
import { ReversalService } from '../ledger/reversal.service.js';
import { TransactionProjectorService } from '../transactions/transaction-projector.service.js';

import { ledgerLabel } from './dispute-format.js';
import { type DisputeRecord } from './dispute.store.js';
import { PROVISIONAL_CREDIT_REFERENCE_PREFIX } from './disputes.constants.js';
import {
  buildBankLossEntry,
  buildProvisionalCreditEntry,
  buildWonPayoutEntry,
  buildWonResolutionEntry,
  type DisputeEntryContext,
} from './domain/dispute-entries.js';

/**
 * Every journal entry a dispute can produce, and nothing else.
 *
 * Each posting is followed by a projection **in the same session**, so the statement line
 * and the money commit together — a credit the ledger booked but the feed never showed is
 * a customer ringing up about money they cannot see.
 *
 * Every reference is derived from the dispute id, which the ledger's unique index on
 * `reference` turns into an independent guarantee against double-booking: a retried
 * decision, a replayed request or two racing readers all converge on one entry.
 *
 * The resolution entries move value between general-ledger accounts only. That is the
 * property that makes it safe for the lazy scheme clock to settle a won case during a
 * read: nothing on a read path can change a customer's balance.
 */
@Injectable()
export class DisputePoster {
  constructor(
    private readonly postings: PostingService,
    private readonly reversals: ReversalService,
    private readonly projector: TransactionProjectorService,
    private readonly clock: ClockService,
  ) {}

  /** The bank's current time. Callers take "now" from here so one clock is in play. */
  now(): Date {
    return this.clock.now();
  }

  /** Puts the money back while the case runs. DEBIT suspense, CREDIT the customer. */
  async creditProvisionally(
    dispute: DisputeRecord,
    amount: Money,
    session: ClientSession,
  ): Promise<string> {
    const reference = `${PROVISIONAL_CREDIT_REFERENCE_PREFIX}${dispute.id}`;
    const entry = await this.postings.post(
      buildProvisionalCreditEntry(this.contextFor(dispute), reference, amount),
      session,
    );

    await this.projector.project(entry, session);
    return entry.id;
  }

  /**
   * Settles a won case.
   *
   * With a provisional credit in place the scheme's recovery clears the suspense the
   * credit parked and the customer's balance does not move — their money simply stops
   * being provisional. Without one, they are paid now out of the same recovery.
   */
  async settleWon(dispute: DisputeRecord, session: ClientSession): Promise<string> {
    const context = this.contextFor(dispute);
    const parked = dispute.provisionalCredit;

    const entry = await this.postings.post(
      parked
        ? buildWonResolutionEntry(context, fromStored(parked))
        : buildWonPayoutEntry(context, fromStored(dispute.disputedAmount)),
      session,
    );

    await this.projector.project(entry, session);
    return entry.id;
  }

  /**
   * Settles a lost case where the bank leaves the credit with the customer.
   *
   * The parked receivable moves onto the expense line, which is where a chargeback the
   * bank chose to absorb belongs — not netted quietly out of fee income.
   */
  async absorbLoss(dispute: DisputeRecord, parked: Money, session: ClientSession): Promise<string> {
    const entry = await this.postings.post(
      buildBankLossEntry(this.contextFor(dispute), parked),
      session,
    );

    await this.projector.project(entry, session);
    return entry.id;
  }

  /**
   * Takes the provisional credit back by reversing the entry that gave it.
   *
   * A reversal rather than an opposing entry of our own making: the ledger mirrors every
   * leg of the original and marks it `REVERSED`, so the statement shows both lines and
   * the customer can see exactly what was given and what was taken.
   */
  async reverseProvisionalCredit(
    entryId: string,
    reason: string,
    session: ClientSession,
  ): Promise<string> {
    const reversal = await this.reversals.reverse({ entryId, reason, session });
    await this.projector.project(reversal, session);
    return reversal.id;
  }

  private contextFor(dispute: DisputeRecord): DisputeEntryContext {
    return {
      disputeId: dispute.id,
      accountId: dispute.accountId,
      description: ledgerLabel(dispute.description),
      valueDate: this.clock.today(),
      bookedAt: this.clock.now(),
    };
  }
}
