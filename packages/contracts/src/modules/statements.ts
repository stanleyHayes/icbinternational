/**
 * Statements and the documents customers can ask the bank to produce.
 *
 * A statement's closing balance is derived from the ledger at the period boundary, not
 * from the running total in the transaction list. The two must agree to the minor unit —
 * an integration test asserts exactly that.
 */

import { z } from 'zod';

import {
  entityId,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  shortTextSchema,
} from '../common/primitives.js';

export const StatementFormat = { PDF: 'PDF', CSV: 'CSV', OFX: 'OFX' } as const;
export type StatementFormat = (typeof StatementFormat)[keyof typeof StatementFormat];

export const statementSchema = z.object({
  id: entityId('stm'),
  accountId: entityId('acc'),
  /** `YYYY-MM` for monthly statements; a range label for ad-hoc ones. */
  period: z.string(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  openingBalance: moneySchema,
  closingBalance: moneySchema,
  totalCredits: moneySchema,
  totalDebits: moneySchema,
  transactionCount: z.number().int(),
  /** Signed, expiring download link. Statements are never publicly addressable. */
  downloadUrl: z.url().nullable(),
  sizeBytes: z.number().int().nullable(),
  generatedAt: isoDateTimeSchema,
});
export type Statement = z.infer<typeof statementSchema>;

export const requestStatementSchema = z.object({
  accountId: entityId('acc'),
  from: isoDateSchema,
  to: isoDateSchema,
  format: z.enum(StatementFormat).default(StatementFormat.PDF),
});
export type RequestStatement = z.infer<typeof requestStatementSchema>;

export const LetterKind = {
  PROOF_OF_BALANCE: 'PROOF_OF_BALANCE',
  PROOF_OF_ADDRESS: 'PROOF_OF_ADDRESS',
  BANK_REFERENCE: 'BANK_REFERENCE',
  ACCOUNT_CONFIRMATION: 'ACCOUNT_CONFIRMATION',
  INTEREST_CERTIFICATE: 'INTEREST_CERTIFICATE',
} as const;
export type LetterKind = (typeof LetterKind)[keyof typeof LetterKind];

export const requestLetterSchema = z.object({
  kind: z.enum(LetterKind),
  accountId: entityId('acc'),
  addressedTo: shortTextSchema.optional(),
  asOfDate: isoDateSchema.optional(),
});
export type RequestLetter = z.infer<typeof requestLetterSchema>;
