import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { EntryType } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';
import { entries } from '../../domain/ledger/index.js';
import { BalanceService } from '../holds/index.js';
import { PostingService } from '../ledger/posting.service.js';
import { TransactionProjectorService } from '../transactions/transaction-projector.service.js';
import { ENTRY_METADATA_KEY } from '../transactions/transactions.constants.js';

import {
  COLLECTION_REFERENCE_PREFIX,
  COLLECTION_SETTLEMENT_PREFIX,
  GUARANTEE_REFUND_DESCRIPTION,
  GUARANTEE_REFUND_PREFIX,
} from './mandate.constants.js';
import { type MandateRecord } from './mandate.store.js';

/** What one collection produced. */
export interface CollectedEntries {
  readonly journalEntryId: string;
  readonly settlementEntryId: string;
  readonly transactionId: string | null;
}

/**
 * The two movements a mandate can cause.
 *
 * **Collection is two entries, not one.** The customer is debited into
 * `UNSETTLED_OUTBOUND` and the scheme is settled out of it in the same transaction. They
 * commit together, so nothing observable sits half-collected — but they stay distinct
 * because they are distinct events, and a return or an indemnity claim later has to be able
 * to say which of them it is undoing.
 *
 * **The guarantee refund is not a reversal.** It is money coming *in*: the bank pays the
 * customer immediately and reclaims from the merchant's bank afterwards, which is exactly
 * `inboundTransfer` — the nostro is debited and the customer is credited. Booking it as a
 * reversal of the original collection would be a claim that the collection never happened,
 * and it did; the customer's statement is entitled to show both.
 */
@Injectable()
export class MandatePoster {
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
   * Takes the collection and settles it against the scheme.
   *
   * @throws {AppError} `INSUFFICIENT_FUNDS` when the account cannot cover it — checked
   *   inside the caller's session, immediately before the debit.
   */
  async collect(input: {
    mandate: MandateRecord;
    amount: Money;
    session: ClientSession;
  }): Promise<CollectedEntries> {
    const { mandate, amount, session } = input;
    await this.balances.assertSufficientFunds(mandate.accountId, amount, session);

    const debit = await this.postings.post(
      entries.outboundTransfer({
        reference: `${COLLECTION_REFERENCE_PREFIX}${mandate.id}:${this.clock.today()}`,
        fromAccountId: mandate.accountId,
        amount,
        fee: Money.zero(amount.currency),
        type: EntryType.DIRECT_DEBIT,
        description: mandate.merchantName,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: metadataFor(mandate),
      }),
      session,
    );

    const rows = await this.projector.project(debit, session);

    const settlement = await this.postings.post(
      entries.settleOutbound({
        reference: `${COLLECTION_SETTLEMENT_PREFIX}${mandate.id}:${this.clock.today()}`,
        amount,
        description: mandate.merchantName,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: { mandateId: mandate.id },
      }),
      session,
    );

    return {
      journalEntryId: debit.id,
      settlementEntryId: settlement.id,
      transactionId: rows.find((row) => row.accountId === mandate.accountId)?.id ?? null,
    };
  }

  /** Pays the customer back in full under the Direct Debit Guarantee. */
  async refund(input: {
    mandate: MandateRecord;
    collectionEntryId: string;
    amount: Money;
    session: ClientSession;
  }): Promise<string> {
    const entry = await this.postings.post(
      entries.inboundTransfer({
        reference: `${GUARANTEE_REFUND_PREFIX}${input.collectionEntryId}`,
        toAccountId: input.mandate.accountId,
        amount: input.amount,
        description: `${input.mandate.merchantName} — ${GUARANTEE_REFUND_DESCRIPTION}`,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: {
          ...metadataFor(input.mandate),
          disputedEntryId: input.collectionEntryId,
        },
      }),
      input.session,
    );

    await this.projector.project(entry, input.session);
    return entry.id;
  }

  /** The amount to collect: the fixed figure for a fixed mandate, or what was asked for. */
  amountFor(mandate: MandateRecord, requested: Money | null, currency: CurrencyCode): Money {
    if (mandate.fixedAmount) return fromStored(mandate.fixedAmount);
    return requested ?? Money.zero(currency);
  }
}

/** Detail the projector lifts onto the customer's statement line. */
function metadataFor(mandate: MandateRecord): Record<string, string> {
  return {
    mandateId: mandate.id,
    mandateReference: mandate.reference,
    [ENTRY_METADATA_KEY.counterpartyName]: mandate.merchantName,
    ...(mandate.merchantLogoUrl ? { [ENTRY_METADATA_KEY.logoUrl]: mandate.merchantLogoUrl } : {}),
  };
}
