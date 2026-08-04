import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { DeclineReason, ErrorCode, HoldReason } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { TransactionRunner } from '../../../database/transaction.runner.js';
import { HoldService } from '../../holds/index.js';
import { CARD_TRANSACTION_LABEL } from '../card.constants.js';

import {
  approvedAuthorisation,
  declinedAuthorisation,
  type AuthorisationDraft,
} from './authorisation.factory.js';
import { AuthorisationStore, type AuthorisationRecord } from './authorisation.store.js';

/**
 * Writing down what the issuer answered.
 *
 * An approval writes the authorisation **and** places the hold in one transaction, and
 * either both land or neither does. An authorisation with no reserve behind it makes
 * money spendable that a merchant is about to claim; a reserve with no authorisation
 * makes money unspendable with no record of why, which is the harder of the two to
 * diagnose weeks later when the customer asks.
 *
 * A decline writes a record and moves nothing.
 */
@Injectable()
export class AuthorisationBookingService {
  private readonly logger = new Logger(AuthorisationBookingService.name);

  constructor(
    private readonly authorisations: AuthorisationStore,
    private readonly holds: HoldService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Reserves the funds and records the approval.
   *
   * A funds check that passed a moment ago can still lose to another authorisation
   * reaching the account first. That race surfaces here as `INSUFFICIENT_FUNDS` from the
   * hold, and it is converted into a decline rather than an error: the terminal needs a
   * response code, and "the money went while you were asking" is a decline in every
   * scheme's vocabulary.
   */
  async approve(draft: AuthorisationDraft, amount: Money): Promise<AuthorisationRecord> {
    try {
      return await this.runner.run((session) => this.approveWithin(draft, amount, session), {
        label: CARD_TRANSACTION_LABEL.AUTHORISE,
      });
    } catch (error) {
      if (!isInsufficientFunds(error)) throw error;
      return this.refuse(draft, DeclineReason.INSUFFICIENT_FUNDS);
    }
  }

  /** Records a refusal. Nothing is reserved and nothing is posted. */
  async refuse(draft: AuthorisationDraft, reason: DeclineReason): Promise<AuthorisationRecord> {
    const record = await this.authorisations.insert(declinedAuthorisation(draft, reason));

    this.logger.log(
      `Declined ${draft.request.amount.format()} on ${draft.card.id}: ${reason} (${record.responseCode})`,
    );
    return record;
  }

  private async approveWithin(
    draft: AuthorisationDraft,
    amount: Money,
    session: ClientSession,
  ): Promise<AuthorisationRecord> {
    const record = await this.authorisations.insert(approvedAuthorisation(draft, amount), session);

    const hold = await this.holds.place({
      accountId: draft.card.accountId,
      amount,
      reason: HoldReason.CARD_AUTHORISATION,
      description: draft.request.merchantName,
      expiresAt: draft.network.expiresAt,
      authorisationId: record.id,
      session,
    });

    const linked = await this.authorisations.patch({
      authorisationId: record.id,
      fields: { holdId: hold.id },
      session,
    });

    if (!linked) throw new Error(`Authorisation ${record.id} vanished mid-approval`);

    this.logger.log(
      `Approved ${amount.format()} on ${draft.card.id} at ${draft.request.merchantName}`,
    );
    return linked;
  }
}

function isInsufficientFunds(error: unknown): boolean {
  return error instanceof AppError && error.code === ErrorCode.INSUFFICIENT_FUNDS;
}
