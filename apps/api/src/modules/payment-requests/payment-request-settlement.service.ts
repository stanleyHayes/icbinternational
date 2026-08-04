import { Injectable } from '@nestjs/common';

import { ErrorCode, PaymentRequestStatus } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountService, assertAccountUsable } from '../accounts/index.js';

import { PaymentRequestPoster } from './payment-request.poster.js';
import { LIVE_STATUSES, notLive } from './payment-request.service.js';
import { PaymentRequestStore, type PaymentRequestRecord } from './payment-request.store.js';

/** Label the transaction runner logs a retried settlement under. */
const SETTLEMENT_LABEL = 'payment-request.pay';

/**
 * Paying a request.
 *
 * **An expired request cannot be paid, and that is enforced by the write.** The status
 * transition names the statuses it will accept and carries the claim in the same atomic
 * operation, inside the transaction that moves the money. A request that lapses while the
 * payer is authorising matches nothing, the transaction rolls back, and the payer is told
 * the link has expired rather than being charged for it.
 *
 * **The payer is not the owner, and that is the point.** A request is a link; whoever holds
 * it may pay it from an account of *their* own. What is checked is that the source account
 * belongs to the person signed in — never that they have any relationship to the request.
 */
@Injectable()
export class PaymentRequestSettlementService {
  constructor(
    private readonly requests: PaymentRequestStore,
    private readonly accounts: AccountService,
    private readonly poster: PaymentRequestPoster,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Settles a request from the payer's account.
   *
   * @throws {AppError} `NOT_FOUND` for an unknown request, `PAYMENT_REQUEST_EXPIRED` when
   *   the window has closed, `CONFLICT` when it was already settled or withdrawn,
   *   `CURRENCY_MISMATCH` when the payer's account is in another currency,
   *   `SAME_ACCOUNT_TRANSFER` when they try to pay themselves, and `INSUFFICIENT_FUNDS`.
   */
  async pay(input: {
    requestId: string;
    payerUserId: string;
    payerName: string;
    sourceAccountId: string;
  }): Promise<PaymentRequestRecord> {
    const request = await this.require(input.requestId);
    const account = await this.accounts.requireOwned({
      userId: input.payerUserId,
      accountId: input.sourceAccountId,
    });
    assertAccountUsable(account);
    assertPayable(request, account.id, account.currency, this.poster.now());

    return this.runner.run(
      async (session) => {
        const journalEntryId = await this.poster.settle({
          request,
          payerAccountId: account.id,
          session,
        });

        const paid = await this.requests.transition({
          id: request.id,
          fromStatuses: LIVE_STATUSES,
          status: PaymentRequestStatus.PAID,
          liveAt: this.poster.now(),
          patch: {
            paidByUserId: input.payerUserId,
            paidByName: input.payerName,
            paidFromAccountId: account.id,
            journalEntryId,
            paidAt: this.poster.now(),
          },
          session,
        });

        // Losing the claim rolls the posting back with it, so a request that lapsed or was
        // settled by somebody else in the meantime leaves the payer's balance untouched.
        if (!paid) throw notLive(lapsed(request, this.poster.now()));
        return paid;
      },
      { label: SETTLEMENT_LABEL },
    );
  }

  private async require(requestId: string): Promise<PaymentRequestRecord> {
    const request = await this.requests.findById(requestId);
    if (!request) throw AppError.notFound('That payment request', requestId);
    return request;
  }
}

/** Everything about the pairing that can be judged before the transaction opens. */
function assertPayable(
  request: PaymentRequestRecord,
  payerAccountId: string,
  payerCurrency: string,
  at: Date,
): void {
  const current = lapsed(request, at);
  if (!LIVE_STATUSES.includes(current.status)) throw notLive(current);

  if (payerAccountId === request.destinationAccountId) {
    throw new AppError({
      code: ErrorCode.SAME_ACCOUNT_TRANSFER,
      message: 'You cannot pay a request into the same account it is asking to be paid from.',
    });
  }

  if (payerCurrency !== request.amount.currency) {
    throw new AppError({
      code: ErrorCode.CURRENCY_MISMATCH,
      message: `This request is for ${request.amount.currency}. Pay it from a ${request.amount.currency} account, or convert first.`,
      context: { requested: request.amount.currency, offered: payerCurrency },
    });
  }
}

/**
 * The request as it stands right now.
 *
 * A request whose window has closed is `EXPIRED` from that instant, whether or not the
 * sweep has caught up with it. Reporting the stored `OPEN` would tell the payer a link is
 * live when it is not, and the conditional write would then refuse them with a conflict
 * they could make no sense of.
 */
function lapsed(request: PaymentRequestRecord, at: Date): PaymentRequestRecord {
  if (request.status !== PaymentRequestStatus.OPEN) return request;
  if (request.expiresAt.getTime() > at.getTime()) return request;

  return { ...request, status: PaymentRequestStatus.EXPIRED };
}
