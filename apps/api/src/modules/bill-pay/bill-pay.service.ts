import { Injectable } from '@nestjs/common';

import {
  BillPaymentStatus,
  ErrorCode,
  type Biller,
  type CreateBillPaymentRequest,
} from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { fromWire, toStored } from '../../common/money/money.codec.js';
import { AccountService, assertAccountUsable } from '../accounts/index.js';

import { BillPaymentBookingService } from './bill-payment-booking.service.js';
import { PaymentKind, type BillPaymentRecord } from './bill-payment.store.js';
import { BillSubmissionTask } from './bill-submission.task.js';
import { BillerDirectoryService } from './biller-directory.service.js';
import {
  assertAmountAccepted,
  assertBillerActive,
  assertReferenceMatches,
} from './biller-validation.js';

/** Everything a caller may specify about a bill payment. */
export interface BillPaymentDraft {
  readonly userId: string;
  readonly request: CreateBillPaymentRequest;
  /** Absent means "now". A future instant creates a scheduled payment. */
  readonly scheduledFor?: Date;
}

/**
 * Paying a bill.
 *
 * The order of operations is the product. Everything the bank can check on its own — the
 * biller exists and is still reachable, the reference has the shape that biller uses, the
 * amount is one they will accept, the account is the customer's and is usable — is checked
 * *before* a penny moves, because a rejection at this point costs the customer a moment and
 * a rejection three days later costs them a late fee.
 *
 * Only then is the money taken, and only then is the biller contacted — by a job, not by
 * this request. Talking to a third party that may take thirty seconds to say nothing is not
 * something a customer should be made to wait for, and a request that times out mid-
 * conversation leaves the bank unable to say whether the payment went.
 */
@Injectable()
export class BillPayService {
  constructor(
    private readonly directory: BillerDirectoryService,
    private readonly accounts: AccountService,
    private readonly booking: BillPaymentBookingService,
    private readonly submissions: BillSubmissionTask,
  ) {}

  /**
   * Validates, debits and queues a bill payment.
   *
   * @throws {AppError} `NOT_FOUND` for an unknown biller, `INVALID_ACCOUNT_NUMBER` for a
   *   reference the biller's format would reject, `AMOUNT_BELOW_MINIMUM` /
   *   `AMOUNT_ABOVE_MAXIMUM` outside their limits, `BILLER_REJECTED` when the biller
   *   disowns the reference on a pre-debit check, and `INSUFFICIENT_FUNDS` when the
   *   account cannot cover it.
   */
  async create(draft: BillPaymentDraft): Promise<BillPaymentRecord> {
    const { request, userId } = draft;
    const biller = await this.directory.require(request.billerId);
    const amount = fromWire(request.amount);

    assertBillerActive(biller);
    assertReferenceMatches(biller, request.customerReference);
    assertAmountAccepted(biller, amount);

    const account = await this.accounts.requireOwned({
      userId,
      accountId: request.sourceAccountId,
    });
    assertAccountUsable(account);

    await this.confirmWithBiller(biller, request.customerReference);

    const scheduledFor = draft.scheduledFor ?? this.booking.now();
    const payment = await this.booking.book({
      userId,
      kind: PaymentKind.BILL,
      billerId: biller.id,
      billerName: biller.name,
      status: BillPaymentStatus.PENDING,
      sourceAccountId: account.id,
      customerReference: request.customerReference.trim(),
      amount: toStored(amount),
      fee: biller.fee,
      topUp: null,
      transactionId: null,
      journalEntryId: null,
      scheduledFor,
      createdAt: scheduledFor,
    });

    // The payment carries its own `scheduledFor`, so the sweep will find it when it falls
    // due; this only shortens the wait for one booked to run now. Not awaited — the customer
    // should not block on the biller answering.
    this.submissions.kick();
    return payment;
  }

  /**
   * Asks the biller to confirm the reference, where the rail supports it.
   *
   * Skipped for billers that do not offer it — most charities and some councils — which is
   * not a gap in the bank's diligence but a fact about the network. Where the answer is
   * available it is used, because catching a wrong reference before the debit is the whole
   * value of having asked.
   */
  private async confirmWithBiller(biller: Biller, reference: string): Promise<void> {
    if (!biller.supportsValidation) return;

    const check = await this.directory.checkAccount(biller, reference);
    if (check.valid) return;

    throw new AppError({
      code: ErrorCode.BILLER_REJECTED,
      message: `${biller.name} does not recognise that ${biller.accountNumberLabel.toLowerCase()}. Check it against your bill and try again.`,
      context: { billerId: biller.id, rejection: check.rejection },
    });
  }
}
