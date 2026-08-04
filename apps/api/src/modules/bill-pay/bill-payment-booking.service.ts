import { Injectable } from '@nestjs/common';

import { BillPaymentStatus } from '@reliance/contracts';

import { fromStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { BalanceService } from '../holds/index.js';

import { BillPaymentPoster } from './bill-payment.poster.js';
import {
  BillPaymentStore,
  type BillPaymentRecord,
  type NewBillPayment,
} from './bill-payment.store.js';

/** Label the transaction runner logs a retried debit under. */
const BOOKING_LABEL = 'billpay.debit';

/**
 * Taking the money, once, atomically.
 *
 * **The customer is debited before the biller is contacted.** That is how bill payment
 * works everywhere: the funds are secured at the moment the customer authorises, because
 * the alternative — contact the biller, then discover the account has been emptied in the
 * meantime — makes the bank liable for money it never held. What the bank owes in return is
 * an absolute guarantee that a payment which does not complete is refunded, which is the
 * processor's side of the same bargain.
 *
 * **The row is written before the entry, and that is deliberate here.** The journal
 * reference is derived from the payment's id, which is what makes the debit idempotent
 * against any retry, so the id has to exist first. The whole sequence is one transaction:
 * there is no instant at which a reader could see a payment row whose money had not moved,
 * or moved money with no payment to explain it.
 */
@Injectable()
export class BillPaymentBookingService {
  constructor(
    private readonly payments: BillPaymentStore,
    private readonly balances: BalanceService,
    private readonly poster: BillPaymentPoster,
    private readonly runner: TransactionRunner,
  ) {}

  /** The bank's current time, so callers building a draft read one clock. */
  now(): Date {
    return this.poster.now();
  }

  /**
   * Records the payment and debits the customer in one unit of work.
   *
   * @throws {AppError} `INSUFFICIENT_FUNDS` when the account cannot cover it — checked
   *   inside the transaction, because a check taken beforehand is a check against a balance
   *   that no longer exists by the time the debit lands.
   */
  async book(draft: NewBillPayment): Promise<BillPaymentRecord> {
    return this.runner.run(
      async (session) => {
        const payment = await this.payments.insert(draft, session);

        await this.balances.assertSufficientFunds(
          payment.sourceAccountId,
          fromStored(payment.amount),
          session,
        );

        const booked = await this.poster.postDebit(payment, session);

        const recorded = await this.payments.transition({
          id: payment.id,
          fromStatuses: [BillPaymentStatus.PENDING],
          status: BillPaymentStatus.PENDING,
          patch: { journalEntryId: booked.entryId, transactionId: booked.transactionId },
          session,
        });

        // The payment was inserted moments earlier inside this same transaction, so nothing
        // else can have moved it on. A null here would mean the store lied about the insert.
        if (!recorded) throw new Error(`Bill payment ${payment.id} vanished mid-transaction`);
        return recorded;
      },
      { label: BOOKING_LABEL },
    );
  }
}
