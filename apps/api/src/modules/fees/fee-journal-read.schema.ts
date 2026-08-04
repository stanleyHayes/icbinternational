import { Schema } from 'mongoose';

import { type PostingDirection } from '@reliance/contracts';

import { JOURNAL_ENTRY_COLLECTION } from '../ledger/ledger.constants.js';

/**
 * A read-only window onto the journal, holding only what fee reconciliation reads.
 *
 * A second model over `journal_entries` — the gl module sets the precedent — because
 * the ledger lane owns the full schema and this module may not edit it. Written with the
 * plain Mongoose `Schema` rather than decorators: this is a projection of another lane's
 * documents, not a collection this module defines, so it stays deliberately minimal.
 */

/** The posting fields reconciliation reads, as plain lean documents. */
export interface JournalPostingLine {
  readonly ledgerAccountCode: string;
  readonly direction: PostingDirection;
  readonly amount: { readonly amount: string; readonly currency: string };
}

/** The entry fields reconciliation reads. */
export interface JournalEntryLine {
  readonly reference: string;
  readonly postings: readonly JournalPostingLine[];
}

const postingLineSchema = new Schema(
  {
    ledgerAccountCode: { type: String, required: true },
    direction: { type: String, required: true },
    amount: {
      amount: { type: String, required: true },
      currency: { type: String, required: true },
    },
  },
  { _id: false },
);

/** Model definition for the fee-income read window over the journal. */
export const FeeJournalReadSchema = new Schema(
  {
    reference: { type: String, required: true },
    postings: { type: [postingLineSchema], required: true },
  },
  { collection: JOURNAL_ENTRY_COLLECTION },
);
