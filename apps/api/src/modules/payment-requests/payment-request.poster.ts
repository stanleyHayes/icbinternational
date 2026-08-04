import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';
import { entries } from '../../domain/ledger/index.js';
import { BalanceService } from '../holds/index.js';
import { PostingService } from '../ledger/posting.service.js';
import { TransactionProjectorService } from '../transactions/transaction-projector.service.js';
import { ENTRY_METADATA_KEY } from '../transactions/transactions.constants.js';

import { REQUEST_REFERENCE_PREFIX } from './payment-request.constants.js';
import { type PaymentRequestRecord } from './payment-request.store.js';

/**
 * Settling a request: one journal entry, both sides, inside the caller's transaction.
 *
 * A paid request *is* an internal transfer — money leaves the payer's account and arrives in
 * the requester's — so it books the same entry a transfer does rather than inventing a
 * second way to move a pound between two customers of the same bank. What the request adds
 * is why: both statements carry the requester's name and the note they wrote, so neither
 * party is left looking at an unexplained movement.
 *
 * The journal reference is derived from the request id, so the ledger's unique index on
 * `reference` is an independent guarantee that one request cannot be paid twice — even if
 * the conditional status write above it were somehow bypassed.
 */
@Injectable()
export class PaymentRequestPoster {
  constructor(
    private readonly postings: PostingService,
    private readonly projector: TransactionProjectorService,
    private readonly balances: BalanceService,
    private readonly clock: ClockService,
  ) {}

  /** The bank's current time, so every collaborator reads one clock. */
  now(): Date {
    return this.clock.now();
  }

  /**
   * Checks the payer can cover it and moves the money.
   *
   * The funds check runs inside the caller's session, immediately before the posting. A
   * check taken outside the transaction that spends the money is a check against a balance
   * that no longer exists.
   *
   * @throws {AppError} `INSUFFICIENT_FUNDS` when the payer's account cannot cover it.
   */
  async settle(input: {
    request: PaymentRequestRecord;
    payerAccountId: string;
    session: ClientSession;
  }): Promise<string> {
    const { request, session } = input;
    const amount = fromStored(request.amount);

    await this.balances.assertSufficientFunds(input.payerAccountId, amount, session);

    const entry = await this.postings.post(
      entries.internalTransfer({
        reference: `${REQUEST_REFERENCE_PREFIX}${request.id}`,
        fromAccountId: input.payerAccountId,
        toAccountId: request.destinationAccountId,
        amount,
        description: narrativeOf(request),
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: {
          paymentRequestId: request.id,
          [ENTRY_METADATA_KEY.counterpartyName]: request.requesterName,
        },
      }),
      session,
    );

    await this.projector.project(entry, session);
    return entry.id;
  }
}

/** What both statements say. The requester's note if they wrote one, their name if not. */
function narrativeOf(request: PaymentRequestRecord): string {
  return request.note?.trim() || request.requesterName;
}
