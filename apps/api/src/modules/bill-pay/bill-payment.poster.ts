import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { EntryType } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';
import { entries } from '../../domain/ledger/index.js';
import { PostingService } from '../ledger/posting.service.js';
import { TransactionProjectorService } from '../transactions/transaction-projector.service.js';
import { ENTRY_METADATA_KEY } from '../transactions/transactions.constants.js';

import {
  BILL_FEE_DESCRIPTION,
  BILL_FEE_PREFIX,
  BILL_REFERENCE_PREFIX,
  BILL_REVERSAL_DESCRIPTION,
  BILL_REVERSAL_PREFIX,
  BILL_SETTLEMENT_PREFIX,
} from './bill-pay.constants.js';
import { billPaymentReversal } from './bill-payment-entries.js';
import { type BillPaymentRecord } from './bill-payment.store.js';

/** What settling a payment produced. The fee entry is absent when the biller charges none. */
export interface SettlementEntries {
  readonly settlementEntryId: string;
  readonly feeEntryId: string | null;
}

/**
 * Every journal entry a bill payment can produce, and nothing else.
 *
 * Four moments, four entries, each with a reference derived from the payment id so the
 * ledger's unique index on `reference` is an independent guarantee that none of them can be
 * booked twice — however many times a job is retried.
 *
 * 1. **Debit** — the customer pays now; the money sits in `UNSETTLED_OUTBOUND` because it
 *    has left them and not yet reached anybody.
 * 2. **Settlement** — the biller confirmed; the in-flight liability becomes a real outflow.
 * 3. **Fee** — charged here and only here. A payment that failed costs the customer
 *    nothing, which is a product decision the accounting has to make true rather than
 *    merely claim.
 * 4. **Reversal** — the biller refused or never answered; the customer gets it all back.
 */
@Injectable()
export class BillPaymentPoster {
  constructor(
    private readonly postings: PostingService,
    private readonly projector: TransactionProjectorService,
    private readonly clock: ClockService,
  ) {}

  /** The bank's current time. Callers take "now" from here so one clock is in play. */
  now(): Date {
    return this.clock.now();
  }

  /**
   * Takes the money and returns the statement row it produced.
   *
   * The fee is deliberately zero on this entry. It is charged on completion, as its own
   * `FEE` entry, so a customer whose payment is refused is never left having paid for the
   * privilege — and so the month's fee income is the balance of account 4000 rather than a
   * figure somebody has to net a refund out of.
   */
  async postDebit(
    payment: BillPaymentRecord,
    session: ClientSession,
  ): Promise<{ entryId: string; transactionId: string | null }> {
    const amount = fromStored(payment.amount);

    const entry = await this.postings.post(
      entries.outboundTransfer({
        reference: `${BILL_REFERENCE_PREFIX}${payment.id}`,
        fromAccountId: payment.sourceAccountId,
        amount,
        fee: Money.zero(amount.currency),
        type: EntryType.BILL_PAYMENT,
        description: payment.billerName,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: metadataFor(payment),
      }),
      session,
    );

    const rows = await this.projector.project(entry, session);
    const row = rows.find((candidate) => candidate.accountId === payment.sourceAccountId);

    return { entryId: entry.id, transactionId: row?.id ?? null };
  }

  /** The biller confirmed: discharge the in-flight liability and charge the fee. */
  async postSettlement(
    payment: BillPaymentRecord,
    session: ClientSession,
  ): Promise<SettlementEntries> {
    const settlement = await this.postings.post(
      entries.settleOutbound({
        reference: `${BILL_SETTLEMENT_PREFIX}${payment.id}`,
        amount: fromStored(payment.amount),
        description: payment.billerName,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: { billPaymentId: payment.id },
      }),
      session,
    );

    return { settlementEntryId: settlement.id, feeEntryId: await this.postFee(payment, session) };
  }

  /**
   * Gives the money back, in full, in the same unit of work that decided it had to be.
   *
   * There is no path in this module where a debit is left standing after a refusal — the
   * processor books this inside the transaction that records the failure, so a customer is
   * never short because a third party timed out.
   */
  async postReversal(payment: BillPaymentRecord, session: ClientSession): Promise<string> {
    const entry = await this.postings.post(
      billPaymentReversal({
        reference: `${BILL_REVERSAL_PREFIX}${payment.id}`,
        accountId: payment.sourceAccountId,
        amount: fromStored(payment.amount),
        description: `${payment.billerName} — ${BILL_REVERSAL_DESCRIPTION}`,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: metadataFor(payment),
      }),
      session,
    );

    await this.projector.project(entry, session);
    return entry.id;
  }

  /** The biller's charge, booked only once the payment actually completed. */
  private async postFee(
    payment: BillPaymentRecord,
    session: ClientSession,
  ): Promise<string | null> {
    const fee = fromStored(payment.fee);
    if (!fee.isPositive) return null;

    const entry = await this.postings.post(
      entries.fee({
        reference: `${BILL_FEE_PREFIX}${payment.id}`,
        accountId: payment.sourceAccountId,
        amount: fee,
        description: BILL_FEE_DESCRIPTION,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: { billPaymentId: payment.id },
      }),
      session,
    );

    await this.projector.project(entry, session);
    return entry.id;
  }
}

/** Detail the projector lifts onto the customer's statement line. */
function metadataFor(payment: BillPaymentRecord): Record<string, string> {
  return {
    billPaymentId: payment.id,
    billerId: payment.billerId,
    [ENTRY_METADATA_KEY.counterpartyName]: payment.billerName,
  };
}
