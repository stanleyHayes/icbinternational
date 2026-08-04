import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ClockService } from '../../common/clock/clock.service.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { fromStored } from '../../common/money/money.codec.js';
import { entries } from '../../domain/ledger/index.js';
import { PostingService } from '../ledger/posting.service.js';
import { TransactionProjectorService } from '../transactions/transaction-projector.service.js';
import { ENTRY_METADATA_KEY } from '../transactions/transactions.constants.js';

import { type FxQuoteRecord } from './fx-quote.store.js';
import { FX_CONVERSION_DESCRIPTION, FX_CONVERSION_REFERENCE_PREFIX } from './fx.constants.js';

/** What one booked conversion produced. */
export interface BookedConversion {
  /** The public identifier the conversion is reported under. */
  readonly conversionId: string;
  readonly entryId: string;
  /** The instant the books were written at, on the bank's clock. */
  readonly at: Date;
}

/**
 * The write half of a conversion: four postings, two statement lines, one entry.
 *
 * A cross-currency conversion is the only movement in the bank that balances *twice* — once
 * in the currency sold and once in the currency bought — and `entries.fxConversion` is the
 * only place that shape is constructed. The spread is not netted into the customer's rate
 * and then forgotten; it is recognised explicitly against `FX_SPREAD_INCOME`, so the
 * month's FX margin is the balance of one account rather than the result of reverse
 * engineering a rate off every trade.
 *
 * The journal reference is derived from the quote id, so the ledger's unique index on
 * `reference` is an independent, final guarantee that one quote cannot book two entries —
 * even if every layer above the database were retried.
 */
@Injectable()
export class FxConversionPoster {
  constructor(
    private readonly postings: PostingService,
    private readonly projector: TransactionProjectorService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /** The bank's current time. Callers take "now" from here so there is one clock in play. */
  now(): Date {
    return this.clock.now();
  }

  /** Books the conversion inside the caller's transaction. */
  async post(quote: FxQuoteRecord, session: ClientSession): Promise<BookedConversion> {
    const at = this.clock.now();

    const entry = await this.postings.post(
      entries.fxConversion({
        reference: `${FX_CONVERSION_REFERENCE_PREFIX}${quote.id}`,
        fromAccountId: quote.fromAccountId,
        toAccountId: quote.toAccountId,
        sellAmount: fromStored(quote.sellAmount),
        buyAmount: fromStored(quote.buyAmount),
        spread: fromStored(quote.spreadCost),
        description: FX_CONVERSION_DESCRIPTION,
        valueDate: this.clock.today(),
        bookedAt: at,
        metadata: metadataFor(quote),
      }),
      session,
    );

    await this.projector.project(entry, session);

    return { conversionId: this.ids.generate('transfer'), entryId: entry.id, at };
  }
}

/**
 * Detail the projector lifts onto both statement lines.
 *
 * The original amount and the rate travel with the entry so that the debit on the sterling
 * wallet reads "£500.00 — converted at 1.1685" rather than an unexplained outflow. A
 * customer reconciling a conversion months later has the rate on the statement itself, not
 * only in a quote record that has since been reaped.
 */
function metadataFor(quote: FxQuoteRecord): Record<string, string> {
  return {
    fxQuoteId: quote.id,
    [ENTRY_METADATA_KEY.counterpartyName]: FX_CONVERSION_DESCRIPTION,
    [ENTRY_METADATA_KEY.originalAmount]: quote.sellAmount.amount,
    [ENTRY_METADATA_KEY.originalCurrency]: quote.sellAmount.currency,
    [ENTRY_METADATA_KEY.exchangeRate]: quote.rate,
  };
}
