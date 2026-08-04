import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { TransferStatus } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';
import { entries } from '../../domain/ledger/index.js';
import { PostingService } from '../ledger/posting.service.js';
import { TransactionProjectorService } from '../transactions/transaction-projector.service.js';
import { ENTRY_METADATA_KEY } from '../transactions/transactions.constants.js';

import { type QuoteRecord } from './quote.store.js';
import { settledTimeline } from './transfer-timeline.js';
import {
  DEFAULT_TRANSFER_DESCRIPTION,
  TRANSFER_FEE_REFERENCE_PREFIX,
  TRANSFER_REFERENCE_PREFIX,
} from './transfer.constants.js';
import { TransferStore, type TransferRecord } from './transfer.store.js';

/** The customer's authorisation, reduced to what the write half needs. */
export interface BookingContext {
  readonly quote: QuoteRecord;
  readonly reference: string | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly beneficiaryId: string | null;
  readonly session: ClientSession;
}

/** What the ledger produced for a transfer. */
export interface BookedEntries {
  readonly entryId: string;
  readonly feeEntryId: string | null;
}

/**
 * The write half of a transfer: the journal entries, and the row that describes them.
 *
 * **The sender's debit and the payee's credit are one journal entry.** Not two entries
 * written close together, not one entry plus a compensating one on failure — one entry,
 * whose balance invariant was checked before it could be constructed. There is therefore no
 * instant, observable by any reader, at which the money is in neither account or in both.
 *
 * **The fee is a second entry, deliberately.** It debits the same account in the same
 * instant, and folding it into the transfer would make "what did we earn in fees this
 * month" a question about parsing narratives rather than summing account 4000 — and would
 * put one confusing line on the customer's statement instead of the two things that
 * actually happened.
 *
 * Each reference is derived from the quote id, so the ledger's unique index on `reference`
 * is a final, independent guarantee that neither entry can be booked twice.
 */
@Injectable()
export class TransferBookingService {
  constructor(
    private readonly postings: PostingService,
    private readonly projector: TransactionProjectorService,
    private readonly transfers: TransferStore,
    private readonly clock: ClockService,
  ) {}

  /** The transfer already booked against this quote, or null. The replay lookup. */
  async findByQuote(quoteId: string, session?: ClientSession): Promise<TransferRecord | null> {
    return this.transfers.findByQuote(quoteId, session);
  }

  /** The movement itself: one entry, both legs, projected onto both statements. */
  async postTransfer(context: BookingContext): Promise<string> {
    const { quote, session } = context;

    const entry = await this.postings.post(
      entries.internalTransfer({
        reference: `${TRANSFER_REFERENCE_PREFIX}${quote.id}`,
        fromAccountId: quote.sourceAccountId,
        toAccountId: requireDestination(quote),
        amount: fromStored(quote.creditAmount),
        description: narrativeOf(context),
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: metadataFor(context),
      }),
      session,
    );

    await this.projector.project(entry, session);
    return entry.id;
  }

  /** The fee, as its own `FEE` entry against the sender. */
  async postFee(context: BookingContext, fee: Money): Promise<string> {
    const { quote, session } = context;

    const entry = await this.postings.post(
      entries.fee({
        reference: `${TRANSFER_FEE_REFERENCE_PREFIX}${quote.id}`,
        accountId: quote.sourceAccountId,
        amount: fee,
        description: 'Transfer fee',
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
        metadata: { transferQuoteId: quote.id },
      }),
      session,
    );

    await this.projector.project(entry, session);
    return entry.id;
  }

  /**
   * Writes the transfer row, after the money has moved.
   *
   * In that order, so a transfer can never point at a journal entry that does not exist.
   * The insert is also the arbiter of "one quote, one transfer": `quoteId` is unique, so two
   * authorisations racing on the same quote are separated here by the database rather than
   * by a check somebody has to remember to write.
   */
  async record(context: BookingContext, booked: BookedEntries): Promise<TransferRecord> {
    const { quote } = context;
    const now = this.clock.now();

    return this.transfers.insert(
      {
        userId: quote.userId,
        quoteId: quote.id,
        rail: quote.rail,
        status: TransferStatus.SETTLED,
        sourceAccountId: quote.sourceAccountId,
        destination: quote.destination,
        destinationAccountId: quote.destinationAccountId,
        debitAmount: quote.debitAmount,
        creditAmount: quote.creditAmount,
        fee: quote.fee,
        exchangeRate: quote.exchangeRate,
        reference: context.reference,
        journalEntryId: booked.entryId,
        feeJournalEntryId: booked.feeEntryId,
        beneficiaryId: context.beneficiaryId,
        timeline: settledTimeline(now),
        estimatedArrival: now,
        settledAt: now,
        metadata: context.metadata,
        createdAt: now,
      },
      context.session,
    );
  }
}

/** The narrative both sides of the payment see on their statement. */
function narrativeOf(context: BookingContext): string {
  return context.reference?.trim() || DEFAULT_TRANSFER_DESCRIPTION;
}

/**
 * Detail the transactions projector lifts onto the customer's statement line.
 *
 * The journal knows the accounting truth and nothing about who was paid, so the module
 * booking the entry supplies the human detail under the keys both lanes agreed on.
 */
function metadataFor(context: BookingContext): Record<string, string> {
  return {
    ...context.metadata,
    transferQuoteId: context.quote.id,
    [ENTRY_METADATA_KEY.counterpartyAccountMasked]: maskedTail(requireDestination(context.quote)),
  };
}

/** Last four characters of the payee's account id — enough to recognise, not to reuse. */
const MASK_TAIL_LENGTH = 4;
function maskedTail(accountId: string): string {
  return `•••${accountId.slice(-MASK_TAIL_LENGTH)}`;
}

/**
 * The credited account, which an internal quote always has.
 *
 * Stated as a guard rather than assumed: `destinationAccountId` is nullable on the record
 * because the domestic and international rails will not have one, and an entry built with
 * an undefined account id would post nowhere at all.
 */
function requireDestination(quote: QuoteRecord): string {
  if (quote.destinationAccountId) return quote.destinationAccountId;
  throw new RangeError(`Internal quote ${quote.id} has no resolved destination account`);
}
