/**
 * The double-entry ledger, exposed for statements, reconciliation and the admin console.
 *
 * Customers see `Transaction` (see `transactions.ts`); this module is the layer beneath —
 * the journal entries and postings that are the actual system of record. Nothing here is
 * ever mutated: a correction is a new, opposing entry, not an edit.
 */

import { z } from 'zod';

import {
  entityId,
  isoDateSchema,
  isoDateTimeSchema,
  metadataSchema,
  moneySchema,
  positiveMoneySchema,
  referenceSchema,
  shortTextSchema,
} from '../common/primitives.js';

export const LedgerAccountType = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
} as const;
export type LedgerAccountType = (typeof LedgerAccountType)[keyof typeof LedgerAccountType];

export const PostingDirection = { DEBIT: 'DEBIT', CREDIT: 'CREDIT' } as const;
export type PostingDirection = (typeof PostingDirection)[keyof typeof PostingDirection];

export const JournalEntryStatus = {
  PENDING: 'PENDING',
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
} as const;
export type JournalEntryStatus = (typeof JournalEntryStatus)[keyof typeof JournalEntryStatus];

/** Why an entry exists. Drives statement narratives and finance reporting. */
export const EntryType = {
  ACCOUNT_OPENING: 'ACCOUNT_OPENING',
  INTERNAL_TRANSFER: 'INTERNAL_TRANSFER',
  DOMESTIC_TRANSFER: 'DOMESTIC_TRANSFER',
  INTERNATIONAL_TRANSFER: 'INTERNATIONAL_TRANSFER',
  INBOUND_TRANSFER: 'INBOUND_TRANSFER',
  CARD_PURCHASE: 'CARD_PURCHASE',
  CARD_REFUND: 'CARD_REFUND',
  ATM_WITHDRAWAL: 'ATM_WITHDRAWAL',
  BILL_PAYMENT: 'BILL_PAYMENT',
  DIRECT_DEBIT: 'DIRECT_DEBIT',
  FEE: 'FEE',
  FEE_WAIVER: 'FEE_WAIVER',
  INTEREST_CREDIT: 'INTEREST_CREDIT',
  INTEREST_DEBIT: 'INTEREST_DEBIT',
  FX_CONVERSION: 'FX_CONVERSION',
  LOAN_DISBURSEMENT: 'LOAN_DISBURSEMENT',
  LOAN_REPAYMENT: 'LOAN_REPAYMENT',
  DEPOSIT_PLACEMENT: 'DEPOSIT_PLACEMENT',
  DEPOSIT_MATURITY: 'DEPOSIT_MATURITY',
  GOAL_CONTRIBUTION: 'GOAL_CONTRIBUTION',
  ROUND_UP: 'ROUND_UP',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  REVERSAL: 'REVERSAL',
  DISPUTE_PROVISIONAL_CREDIT: 'DISPUTE_PROVISIONAL_CREDIT',
  DISPUTE_RESOLUTION: 'DISPUTE_RESOLUTION',
  WRITE_OFF: 'WRITE_OFF',
} as const;
export type EntryType = (typeof EntryType)[keyof typeof EntryType];

export const ledgerAccountSchema = z.object({
  id: entityId('gla'),
  code: z.string().regex(/^\d{4}$/),
  name: shortTextSchema,
  type: z.enum(LedgerAccountType),
  /** A control account rolls up customer accounts and cannot be posted to directly. */
  isControlAccount: z.boolean(),
  balance: moneySchema,
});
export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;

export const postingSchema = z.object({
  ledgerAccountCode: z.string().regex(/^\d{4}$/),
  ledgerAccountName: shortTextSchema,
  /** Present when the posting also hits a customer-facing account. */
  accountId: entityId('acc').nullable(),
  direction: z.enum(PostingDirection),
  amount: positiveMoneySchema,
  narrative: shortTextSchema,
});
export type Posting = z.infer<typeof postingSchema>;

export const journalEntrySchema = z.object({
  id: entityId('jnl'),
  reference: referenceSchema,
  type: z.enum(EntryType),
  status: z.enum(JournalEntryStatus),
  description: shortTextSchema,
  /** Accounting date — may differ from `bookedAt` for back-valued items. */
  valueDate: isoDateSchema,
  bookedAt: isoDateTimeSchema,
  postings: z.array(postingSchema).min(2),
  /** Set when this entry reverses another. Reversals are never deletions. */
  reversesEntryId: entityId('jnl').nullable(),
  reversedByEntryId: entityId('jnl').nullable(),
  metadata: metadataSchema,
});
export type JournalEntry = z.infer<typeof journalEntrySchema>;

/** Per-currency trial balance. `difference` must be zero — if it isn't, stop the bank. */
export const trialBalanceSchema = z.object({
  currency: z.string().length(3),
  asOf: isoDateTimeSchema,
  lines: z.array(
    z.object({
      code: z.string(),
      name: shortTextSchema,
      type: z.enum(LedgerAccountType),
      debit: moneySchema,
      credit: moneySchema,
    }),
  ),
  totalDebits: moneySchema,
  totalCredits: moneySchema,
  difference: moneySchema,
  balanced: z.boolean(),
});
export type TrialBalance = z.infer<typeof trialBalanceSchema>;

// --- Holds ----------------------------------------------------------------

export const HoldStatus = {
  ACTIVE: 'ACTIVE',
  CAPTURED: 'CAPTURED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
} as const;
export type HoldStatus = (typeof HoldStatus)[keyof typeof HoldStatus];

export const HoldReason = {
  CARD_AUTHORISATION: 'CARD_AUTHORISATION',
  PENDING_TRANSFER: 'PENDING_TRANSFER',
  COMPLIANCE_REVIEW: 'COMPLIANCE_REVIEW',
  COURT_ORDER: 'COURT_ORDER',
  DISPUTE: 'DISPUTE',
  MANUAL_LIEN: 'MANUAL_LIEN',
} as const;
export type HoldReason = (typeof HoldReason)[keyof typeof HoldReason];

export const holdSchema = z.object({
  id: entityId('hld'),
  accountId: entityId('acc'),
  amount: positiveMoneySchema,
  reason: z.enum(HoldReason),
  status: z.enum(HoldStatus),
  description: shortTextSchema,
  placedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.nullable(),
  resolvedAt: isoDateTimeSchema.nullable(),
});
export type Hold = z.infer<typeof holdSchema>;
