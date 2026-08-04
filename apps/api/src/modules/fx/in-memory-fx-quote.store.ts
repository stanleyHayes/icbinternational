import { Injectable } from '@nestjs/common';

import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  FxQuoteStore,
  type ConsumeFxQuoteInput,
  type FxQuoteRecord,
  type NewFxQuote,
} from './fx-quote.store.js';

/**
 * An honest, in-memory {@link FxQuoteStore}.
 *
 * "Honest" is doing the work. {@link consume} reads and writes with no `await` between
 * them, exactly as `findOneAndUpdate` behaves, and applies both conditions the repository
 * puts in its filter. An implementation that awaited a lookup and then wrote would let two
 * executions of one quote both observe it unspent and both succeed — the interleaving the
 * atomic write exists to prevent — and the exactly-once test would pass while the property
 * it asserts went untested.
 *
 * Shipped in `src` rather than in a test folder so the seed and simulation lanes have a
 * quote sink, and so the fake cannot quietly drift away from its abstraction.
 */
@Injectable()
export class InMemoryFxQuoteStore extends FxQuoteStore {
  private readonly byId = new Map<string, FxQuoteRecord>();

  constructor(private readonly ids: IdGenerator = new IdGenerator()) {
    super();
  }

  override async insert(quote: NewFxQuote): Promise<FxQuoteRecord> {
    const record: FxQuoteRecord = {
      ...quote,
      id: this.ids.generate('quote'),
      conversionId: null,
      journalEntryId: null,
      executedAt: null,
    };

    this.byId.set(record.id, record);
    return record;
  }

  override async findById(id: string, userId: string): Promise<FxQuoteRecord | null> {
    const record = this.byId.get(id);
    return record && record.userId === userId ? record : null;
  }

  override async findByConversion(conversionId: string): Promise<FxQuoteRecord | null> {
    return [...this.byId.values()].find((record) => record.conversionId === conversionId) ?? null;
  }

  override async consume(input: ConsumeFxQuoteInput): Promise<FxQuoteRecord | null> {
    const held = this.byId.get(input.quoteId);
    const record = held && held.userId === input.userId ? held : null;
    if (!record || record.conversionId !== null) return null;
    if (record.expiresAt.getTime() <= input.at.getTime()) return null;

    const consumed: FxQuoteRecord = {
      ...record,
      conversionId: input.conversionId,
      journalEntryId: input.journalEntryId,
      executedAt: input.at,
    };

    this.byId.set(consumed.id, consumed);
    return consumed;
  }

  override async listExecuted(userId: string, limit: number): Promise<readonly FxQuoteRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.userId === userId && record.executedAt !== null)
      .sort(newestExecutedFirst)
      .slice(0, limit);
  }
}

function newestExecutedFirst(left: FxQuoteRecord, right: FxQuoteRecord): number {
  const byTime = (right.executedAt?.getTime() ?? 0) - (left.executedAt?.getTime() ?? 0);
  return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
}
