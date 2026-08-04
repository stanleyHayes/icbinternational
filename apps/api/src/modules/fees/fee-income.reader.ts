import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { PostingDirection } from '@reliance/contracts';

import { GL } from '../../domain/ledger/index.js';
import { REVERSAL_REFERENCE_PREFIX } from '../ledger/ledger.constants.js';

import { type CurrencyTotal } from './fee-charge.store.js';
import { type JournalEntryLine, type JournalPostingLine } from './fee-journal-read.schema.js';
import { FEE_JOURNAL_READ_MODEL, FEE_REFERENCE_PREFIX } from './fees.constants.js';

/** Matches this module's references and reversals of them, anchored at the start. */
const FEE_REFERENCE_PATTERN = new RegExp(
  `^(?:${REVERSAL_REFERENCE_PREFIX})?${FEE_REFERENCE_PREFIX}`,
);

/**
 * Fee income read back out of the journal, for reconciliation.
 *
 * A read-only window over `journal_entries` restricted to this module's own references:
 * other lanes also credit GL 4000 (a transfer books its own fee), so the account's raw
 * balance is not this module's figure to check. What is: every entry booked under a
 * `FEE-` reference, reversed ones included with the opposite sign.
 *
 * The scan is ops-grade — it runs on demand, not on a request path — and reads lean
 * projections rather than hydrating entries.
 */
@Injectable()
export class FeeIncomeReader {
  constructor(
    @InjectModel(FEE_JOURNAL_READ_MODEL)
    private readonly model: Model<JournalEntryLine>,
  ) {}

  /** Signed fee income per currency: credits to GL 4000 net of reversal debits. */
  async feeIncomeTotals(): Promise<CurrencyTotal[]> {
    const entries = await this.model
      .find({ reference: { $regex: FEE_REFERENCE_PATTERN } }, { postings: 1 })
      .lean()
      .exec();

    const totals = new Map<string, bigint>();
    for (const entry of entries) {
      for (const posting of entry.postings) {
        accumulate(totals, posting);
      }
    }

    return [...totals.entries()].map(([currency, totalMinor]) => ({ currency, totalMinor }));
  }
}

/** Folds one posting into the running per-currency totals, ignoring non-fee-income legs. */
function accumulate(totals: Map<string, bigint>, posting: JournalPostingLine): void {
  if (posting.ledgerAccountCode !== GL.FEE_INCOME) return;

  const signed =
    posting.direction === PostingDirection.CREDIT
      ? BigInt(posting.amount.amount)
      : -BigInt(posting.amount.amount);

  totals.set(posting.amount.currency, (totals.get(posting.amount.currency) ?? 0n) + signed);
}
