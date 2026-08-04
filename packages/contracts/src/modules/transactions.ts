/**
 * The customer-facing view of money movement.
 *
 * A transaction is a projection of one side of a journal entry, enriched with the things
 * a person actually needs: who the counterparty was, what category the spend falls into,
 * and what the balance was immediately afterwards.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  currencyCodeSchema,
  entityId,
  isoDateTimeSchema,
  mccSchema,
  moneySchema,
  referenceSchema,
  shortTextSchema,
} from '../common/primitives.js';

import { EntryType } from './ledger.js';

export const TransactionDirection = { DEBIT: 'DEBIT', CREDIT: 'CREDIT' } as const;
export type TransactionDirection = (typeof TransactionDirection)[keyof typeof TransactionDirection];

export const TransactionStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED',
  DISPUTED: 'DISPUTED',
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const SpendCategory = {
  GROCERIES: 'GROCERIES',
  DINING: 'DINING',
  TRANSPORT: 'TRANSPORT',
  FUEL: 'FUEL',
  SHOPPING: 'SHOPPING',
  ENTERTAINMENT: 'ENTERTAINMENT',
  SUBSCRIPTIONS: 'SUBSCRIPTIONS',
  UTILITIES: 'UTILITIES',
  RENT_MORTGAGE: 'RENT_MORTGAGE',
  HEALTH: 'HEALTH',
  EDUCATION: 'EDUCATION',
  TRAVEL: 'TRAVEL',
  INSURANCE: 'INSURANCE',
  TRANSFERS: 'TRANSFERS',
  CASH: 'CASH',
  FEES: 'FEES',
  INCOME: 'INCOME',
  SAVINGS: 'SAVINGS',
  UNCATEGORISED: 'UNCATEGORISED',
} as const;
export type SpendCategory = (typeof SpendCategory)[keyof typeof SpendCategory];

export const counterpartySchema = z.object({
  name: shortTextSchema,
  /** Present for card spend. */
  merchantId: z.string().nullable(),
  mcc: mccSchema.nullable(),
  logoUrl: z.url().nullable(),
  accountNumberMasked: z.string().nullable(),
  country: z.string().length(2).nullable(),
});
export type Counterparty = z.infer<typeof counterpartySchema>;

export const transactionSchema = z.object({
  id: entityId('txn'),
  accountId: entityId('acc'),
  journalEntryId: entityId('jnl'),
  direction: z.enum(TransactionDirection),
  status: z.enum(TransactionStatus),
  type: z.enum(EntryType),
  amount: moneySchema,
  /** Balance on this account immediately after the posting. */
  runningBalance: moneySchema,
  /** Original amount before conversion, for cross-currency movements. */
  originalAmount: moneySchema.nullable(),
  exchangeRate: z.string().nullable(),
  description: shortTextSchema,
  reference: referenceSchema.nullable(),
  category: z.enum(SpendCategory),
  /** True when the customer overrode the automatic categorisation. */
  categoryOverridden: z.boolean(),
  counterparty: counterpartySchema.nullable(),
  notes: shortTextSchema.nullable(),
  attachmentIds: z.array(entityId('doc')),
  disputeId: entityId('dsp').nullable(),
  bookedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const listTransactionsQuerySchema = cursorQuerySchema.extend({
  accountId: entityId('acc').optional(),
  direction: z.enum(TransactionDirection).optional(),
  status: z.enum(TransactionStatus).optional(),
  category: z.enum(SpendCategory).optional(),
  type: z.enum(EntryType).optional(),
  /** Full-text over description, reference and counterparty name. */
  search: z.string().trim().max(120).optional(),
  minAmount: z.string().regex(/^\d+$/).optional(),
  maxAmount: z.string().regex(/^\d+$/).optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export const updateTransactionRequestSchema = z.object({
  category: z.enum(SpendCategory).optional(),
  notes: shortTextSchema.nullable().optional(),
});
export type UpdateTransactionRequest = z.infer<typeof updateTransactionRequestSchema>;

export const ExportFormat = { CSV: 'CSV', OFX: 'OFX', PDF: 'PDF', JSON: 'JSON' } as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

export const exportTransactionsQuerySchema = z.object({
  accountId: entityId('acc'),
  format: z.enum(ExportFormat).default(ExportFormat.CSV),
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
});
export type ExportTransactionsQuery = z.infer<typeof exportTransactionsQuerySchema>;

// --- Insights -------------------------------------------------------------

/** Query for `GET /insights/spend`. */
export const spendQuerySchema = z.object({
  accountId: entityId('acc').optional(),
  currency: currencyCodeSchema.optional(),
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
});
export type SpendQuery = z.infer<typeof spendQuerySchema>;

/**
 * Query for `GET /insights/cashflow`.
 *
 * `accountId` is required, unlike the spend query. A cash-flow bucket carries a closing
 * balance, and a closing balance belongs to an account — summing one across a customer's
 * accounts in different currencies produces a number that means nothing.
 */
export const cashflowQuerySchema = z.object({
  accountId: entityId('acc'),
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  granularity: z.enum(['DAY', 'WEEK', 'MONTH']).default('MONTH'),
});
export type CashflowQuery = z.infer<typeof cashflowQuerySchema>;

/** Query for `GET /insights/subscriptions`. */
export const subscriptionQuerySchema = z.object({
  accountId: entityId('acc').optional(),
  minOccurrences: z.coerce.number().int().min(2).default(3),
});
export type SubscriptionQuery = z.infer<typeof subscriptionQuerySchema>;

export const spendByCategorySchema = z.object({
  currency: currencyCodeSchema,
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  total: moneySchema,
  categories: z.array(
    z.object({
      category: z.enum(SpendCategory),
      total: moneySchema,
      transactionCount: z.number().int(),
      /** Share of total spend, in basis points, so no float ever reaches the client. */
      shareBps: z.number().int().min(0).max(10_000),
      changeFromPreviousBps: z.number().int().nullable(),
    }),
  ),
});
export type SpendByCategory = z.infer<typeof spendByCategorySchema>;

export const cashflowSchema = z.object({
  currency: currencyCodeSchema,
  buckets: z.array(
    z.object({
      period: z.string(),
      moneyIn: moneySchema,
      moneyOut: moneySchema,
      net: moneySchema,
      closingBalance: moneySchema,
    }),
  ),
});
export type Cashflow = z.infer<typeof cashflowSchema>;

export const subscriptionSchema = z.object({
  merchantName: shortTextSchema,
  logoUrl: z.url().nullable(),
  amount: moneySchema,
  cadence: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']),
  lastChargedAt: isoDateTimeSchema,
  nextExpectedAt: isoDateTimeSchema,
  transactionCount: z.number().int(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const budgetSchema = z.object({
  id: entityId('bdg'),
  category: z.enum(SpendCategory),
  limit: moneySchema,
  spent: moneySchema,
  remaining: moneySchema,
  utilisationBps: z.number().int(),
  periodStart: isoDateTimeSchema,
  periodEnd: isoDateTimeSchema,
  alertAtBps: z.number().int().min(0).max(10_000),
});
export type Budget = z.infer<typeof budgetSchema>;

export const upsertBudgetRequestSchema = z.object({
  category: z.enum(SpendCategory),
  limit: moneySchema,
  alertAtBps: z.number().int().min(0).max(10_000).default(8000),
});
export type UpsertBudgetRequest = z.infer<typeof upsertBudgetRequestSchema>;
