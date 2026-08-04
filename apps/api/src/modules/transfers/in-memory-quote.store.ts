import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  QuoteStore,
  type ConsumeQuoteInput,
  type NewQuote,
  type QuoteRecord,
} from './quote.store.js';

/**
 * An honest, in-memory {@link QuoteStore}.
 *
 * The one behaviour that has to be right is {@link consume}: it binds a quote only while
 * the quote is unbound, exactly as the Mongo `findOneAndUpdate` filter does. A fake that
 * consumed unconditionally would make the double-execution tests pass for the wrong
 * reason — they would prove the fake forgiving rather than the use case correct.
 */
@Injectable()
export class InMemoryQuoteStore extends QuoteStore {
  private readonly byId = new Map<string, QuoteRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(quote: NewQuote): Promise<QuoteRecord> {
    const record: QuoteRecord = {
      ...quote,
      id: this.ids.generate('quote'),
      warnings: [...quote.warnings],
      consumedByTransferId: null,
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string, userId: string): Promise<QuoteRecord | null> {
    const record = this.byId.get(id);
    return record && record.userId === userId ? record : null;
  }

  override async consume(input: ConsumeQuoteInput): Promise<QuoteRecord | null> {
    const record = this.byId.get(input.quoteId);
    if (!record || record.consumedByTransferId !== null) return null;

    const consumed: QuoteRecord = { ...record, consumedByTransferId: input.transferId };
    this.byId.set(consumed.id, consumed);
    return consumed;
  }
}
