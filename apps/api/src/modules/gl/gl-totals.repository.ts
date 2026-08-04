import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { JournalEntryStatus, PostingDirection } from '@reliance/contracts';

import { type JournalEntrySchemaClass } from '../ledger/schemas/journal-entry.schema.js';

import { GL_JOURNAL_READ_MODEL } from './gl.constants.js';

/**
 * Gross movement on one GL account in one currency, as minor-unit decimal strings.
 *
 * Strings, not numbers, so the repository boundary carries no float and no BSON type:
 * minor units can exceed 2^53 in low-denomination currencies, and the caller converts
 * straight into `Money`.
 */
export interface GlAccountTotals {
  readonly code: string;
  readonly debits: string;
  readonly credits: string;
}

interface AggregationRow {
  readonly _id: { readonly code: string; readonly direction: PostingDirection };
  readonly total: { toString(): string };
}

/**
 * Read-side aggregation over the journal — how reporting answers "how much has moved
 * through each GL account" without loading a single journal entry into memory.
 *
 * The module registers the ledger's own schema for this model, so the aggregation runs
 * against the same collection the ledger writes, with the same validation. Nothing here
 * writes to the journal; the collection stays owned by the ledger module.
 */
@Injectable()
export class GlTotalsRepository {
  constructor(
    @InjectModel(GL_JOURNAL_READ_MODEL)
    private readonly journalEntries: Model<JournalEntrySchemaClass>,
  ) {}

  /**
   * Gross debits and credits per GL account in one currency.
   *
   * `PENDING` entries are excluded: they have not happened yet. `REVERSED` entries are
   * *included* — a reversal is a separate posted entry that cancels its original, so both
   * must count for the per-account figures to net to the truth.
   */
  async totalsByAccount(currency: string): Promise<GlAccountTotals[]> {
    const rows = (await this.journalEntries
      .aggregate<AggregationRow>([
        { $match: { status: { $ne: JournalEntryStatus.PENDING } } },
        { $unwind: '$postings' },
        { $match: { 'postings.amount.currency': currency } },
        {
          $group: {
            _id: {
              code: '$postings.ledgerAccountCode',
              direction: '$postings.direction',
            },
            // Minor units are stored as integer strings; $toDecimal keeps the sum exact
            // where $toLong would overflow and a double would round.
            total: { $sum: { $toDecimal: '$postings.amount.amount' } },
          },
        },
      ])
      .exec()) as AggregationRow[];

    return mergeDirections(rows);
  }
}

/** Folds the per-direction aggregation rows into one row per account. */
function mergeDirections(rows: readonly AggregationRow[]): GlAccountTotals[] {
  const ZERO = '0';
  const byCode = new Map<string, { debits: string; credits: string }>();

  for (const row of rows) {
    const entry = byCode.get(row._id.code) ?? { debits: ZERO, credits: ZERO };
    if (row._id.direction === PostingDirection.DEBIT) entry.debits = row.total.toString();
    else entry.credits = row.total.toString();
    byCode.set(row._id.code, entry);
  }

  return [...byCode.entries()].map(([code, totals]) => ({ code, ...totals }));
}
