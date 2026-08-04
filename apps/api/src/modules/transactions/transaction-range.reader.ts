import { Injectable } from '@nestjs/common';

import { TransactionStore, type TransactionRecord } from './repositories/transaction.store.js';
import { MAX_RANGE_SCAN } from './transactions.constants.js';

/** A window of one customer's history, optionally narrowed to a single account. */
export interface TransactionRange {
  readonly userId: string;
  readonly accountId?: string;
  readonly from: Date;
  readonly to: Date;
}

/**
 * Reads a whole date range, oldest first, in keyset batches.
 *
 * Exists as its own service because three callers need exactly this and none of them
 * should own the loop: exports, spend analysis and cashflow all walk a customer's history
 * forwards, and all three must see identically the same rows. Sharing the reader is what
 * makes "the category totals reconcile to the transaction list" a structural property
 * rather than a coincidence that a test happens to catch.
 *
 * Keyset rather than skip/limit because a row inserted mid-scan shifts every subsequent
 * offset — which double-counts one transaction and drops another, in a total the customer
 * is checking against their own arithmetic.
 */
@Injectable()
export class TransactionRangeReader {
  constructor(private readonly transactions: TransactionStore) {}

  /**
   * Every transaction in the range, in booking order.
   *
   * Materialised rather than streamed: the consumers all need more than one pass over the
   * data (a spend total, then a per-category share of it) and the batch ceiling keeps the
   * working set bounded regardless of how long the customer has banked here.
   */
  async readAll(range: TransactionRange): Promise<TransactionRecord[]> {
    const collected: TransactionRecord[] = [];
    let afterId: string | undefined;

    for (;;) {
      const batch = await this.transactions.scanRange({
        userId: range.userId,
        ...(range.accountId ? { accountId: range.accountId } : {}),
        from: range.from,
        to: range.to,
        limit: MAX_RANGE_SCAN,
        ...(afterId ? { afterId } : {}),
      });

      collected.push(...batch);
      // A short batch is the only condition that proves the range is exhausted. A full one
      // may or may not be the last, and asking costs a round trip on every request.
      if (batch.length < MAX_RANGE_SCAN) return collected;
      afterId = batch.at(-1)?.id;
    }
  }
}
