import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { AuthorisationStatus, HoldReason, HoldStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { fromStored, toStored } from '../../../common/money/money.codec.js';
import { TransactionRunner } from '../../../database/transaction.runner.js';
import { MAX_INCREMENTAL_AUTHORISATIONS } from '../../../rails/card-network/index.js';
import { HoldService } from '../../holds/index.js';
import { AUTHORISATION_EXPIRY_BATCH, CARD_TRANSACTION_LABEL } from '../card.constants.js';
import { authorisationNotOpen } from '../card.errors.js';

import { AuthorisationStore, type AuthorisationRecord } from './authorisation.store.js';

/** Statuses an authorisation can still be raised, reversed or expired from. */
const OPEN_STATUSES: readonly AuthorisationStatus[] = [AuthorisationStatus.APPROVED];

/**
 * What happens to an approval that is not a capture.
 *
 * Three endings, and all three finish the same way: the hold goes back. An **increment**
 * replaces the hold with a bigger one, because a hotel that opens a tab on Monday adds to
 * it every night. A **reversal** is the merchant saying they will not claim after all —
 * the customer walked out of the restaurant, the online basket was abandoned — and the
 * money must be spendable again immediately, not in seven days. An **expiry** is the
 * scheme's own deadline passing with nobody having claimed.
 *
 * Each transitions the authorisation conditionally on it still being open, which is what
 * makes exactly one of the three win when they race.
 */
@Injectable()
export class AuthorisationLifecycleService {
  private readonly logger = new Logger(AuthorisationLifecycleService.name);

  constructor(
    private readonly authorisations: AuthorisationStore,
    private readonly holds: HoldService,
    private readonly clock: ClockService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Raises an open authorisation to a larger amount.
   *
   * The old hold is released and a new one placed for the full new total, inside one
   * transaction. Placing a second hold for the difference would look equivalent and is
   * not: a partial capture would then have two reserves to reconcile against one
   * presentment, and the arithmetic that gives unspent money back stops being provable.
   *
   * @throws {AppError} `CONFLICT` when the authorisation is closed or has been raised too
   *   many times; whatever the funds check refuses when the account cannot cover the rise.
   */
  async increment(input: { authorisationId: string; to: Money }): Promise<AuthorisationRecord> {
    return this.runner.run((session) => this.incrementWithin(input, session), {
      label: CARD_TRANSACTION_LABEL.INCREMENT,
    });
  }

  /**
   * Reverses an open authorisation in full.
   *
   * @throws {AppError} `CONFLICT` when it has already been captured, reversed or lapsed.
   */
  async reverse(authorisationId: string): Promise<AuthorisationRecord> {
    return this.runner.run((session) => this.reverseWithin(authorisationId, session), {
      label: CARD_TRANSACTION_LABEL.REVERSE,
    });
  }

  /**
   * Expires every approval whose scheme deadline has passed.
   *
   * Each in its own transaction, so one account locked by a concurrent authorisation
   * cannot stop the sweep freeing everybody else's money.
   *
   * @returns How many authorisations this pass expired.
   */
  async expireDue(limit: number = AUTHORISATION_EXPIRY_BATCH): Promise<number> {
    const due = await this.authorisations.listExpired({ asOf: this.clock.now(), limit });
    let expired = 0;

    for (const record of due) {
      const closed = await this.close(record, AuthorisationStatus.EXPIRED);
      if (closed) expired += 1;
    }

    if (expired > 0) this.logger.log(`Expired ${expired} card authorisations`);
    return expired;
  }

  private async incrementWithin(
    input: { authorisationId: string; to: Money },
    session: ClientSession,
  ): Promise<AuthorisationRecord> {
    const record = await this.requireOpen(input.authorisationId, session);
    assertIncrementable(record, input.to);

    if (record.holdId) await this.holds.release({ holdId: record.holdId, session });

    const hold = await this.holds.place({
      accountId: record.accountId,
      amount: input.to,
      reason: HoldReason.CARD_AUTHORISATION,
      description: record.merchantName,
      expiresAt: record.expiresAt,
      authorisationId: record.id,
      session,
    });

    const raised = await this.authorisations.patch({
      authorisationId: record.id,
      fields: {
        amount: toStored(input.to),
        holdId: hold.id,
        incrementCount: record.incrementCount + 1,
      },
      expectedStatuses: OPEN_STATUSES,
      session,
    });

    if (!raised) throw alreadyClosed(record);

    this.logger.log(`Authorisation ${record.id} raised to ${input.to.format()}`);
    return raised;
  }

  private async reverseWithin(
    authorisationId: string,
    session: ClientSession,
  ): Promise<AuthorisationRecord> {
    const record = await this.requireOpen(authorisationId, session);

    const reversed = await this.authorisations.patch({
      authorisationId: record.id,
      fields: { status: AuthorisationStatus.REVERSED, reversedAt: this.clock.now() },
      expectedStatuses: OPEN_STATUSES,
      session,
    });

    if (!reversed) throw alreadyClosed(record);
    if (record.holdId) await this.holds.release({ holdId: record.holdId, session });

    this.logger.log(`Authorisation ${record.id} reversed; ${amountOf(record)} released`);
    return reversed;
  }

  /** Closes one authorisation and gives its hold back. False when something beat us to it. */
  private async close(record: AuthorisationRecord, status: AuthorisationStatus): Promise<boolean> {
    const closed = await this.authorisations.patch({
      authorisationId: record.id,
      fields: { status, reversedAt: this.clock.now() },
      expectedStatuses: OPEN_STATUSES,
    });

    if (!closed) return false;

    // The hold's own expiry sweep may already have released it; that path is idempotent
    // at the hold, so a double release is refused there rather than double-counted here.
    if (record.holdId) {
      const hold = await this.holds.require(record.holdId);
      if (hold.status === HoldStatus.ACTIVE) await this.holds.release({ holdId: hold.id });
    }

    return true;
  }

  private async requireOpen(
    authorisationId: string,
    session: ClientSession,
  ): Promise<AuthorisationRecord> {
    const record = await this.authorisations.findById(authorisationId, session);
    if (!record) {
      throw authorisationNotOpen({
        authorisationId,
        message: 'We could not find that card payment.',
      });
    }

    if (record.status !== AuthorisationStatus.APPROVED) throw alreadyClosed(record);
    return record;
  }
}

function assertIncrementable(record: AuthorisationRecord, to: Money): void {
  if (record.incrementCount >= MAX_INCREMENTAL_AUTHORISATIONS) {
    throw authorisationNotOpen({
      authorisationId: record.id,
      message: 'This payment has been raised as many times as the card scheme allows.',
    });
  }

  if (!to.greaterThan(fromStored(record.amount))) {
    throw authorisationNotOpen({
      authorisationId: record.id,
      message: 'A payment can only be raised to a larger amount, never reduced.',
    });
  }
}

function alreadyClosed(record: AuthorisationRecord) {
  return authorisationNotOpen({
    authorisationId: record.id,
    message: `This payment has already been ${record.status.toLowerCase()}.`,
  });
}

function amountOf(record: AuthorisationRecord): string {
  return fromStored(record.amount).format();
}
