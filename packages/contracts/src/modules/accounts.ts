/**
 * Customer accounts and the balances projected onto them.
 *
 * A balance in this contract is a *projection* of the ledger, never the source of truth.
 * `ledgerBalance` is what has been booked; `availableBalance` is what the customer can
 * actually spend — booked, minus holds, plus any active overdraft facility.
 */

import { z } from 'zod';

import {
  accountNumberSchema,
  currencyCodeSchema,
  entityId,
  ibanSchema,
  isoDateTimeSchema,
  moneySchema,
  shortTextSchema,
  sortCodeSchema,
} from '../common/primitives.js';

export const AccountType = {
  CURRENT: 'CURRENT',
  SAVINGS: 'SAVINGS',
  JOINT: 'JOINT',
  BUSINESS: 'BUSINESS',
  FX_WALLET: 'FX_WALLET',
  FIXED_DEPOSIT: 'FIXED_DEPOSIT',
  LOAN: 'LOAN',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const AccountStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  FROZEN: 'FROZEN',
  DORMANT: 'DORMANT',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const balanceSchema = z.object({
  /** Booked balance — the sum of every posting against this account. */
  ledger: moneySchema,
  /** Spendable now: ledger − holds + overdraft headroom. */
  available: moneySchema,
  /** Total of authorisations and liens not yet cleared. */
  held: moneySchema,
  /** Unused overdraft facility, zero when none is active. */
  overdraftAvailable: moneySchema,
  asOf: isoDateTimeSchema,
});
export type Balance = z.infer<typeof balanceSchema>;

export const accountSchema = z.object({
  id: entityId('acc'),
  userId: entityId('usr'),
  type: z.enum(AccountType),
  status: z.enum(AccountStatus),
  currency: currencyCodeSchema,
  productCode: shortTextSchema,
  productName: shortTextSchema,
  /** Customer-set label; falls back to the product name when unset. */
  nickname: shortTextSchema.nullable(),
  number: accountNumberSchema,
  sortCode: sortCodeSchema,
  iban: ibanSchema,
  balance: balanceSchema,
  /** Present for joint accounts. The primary holder is always first. */
  holderIds: z.array(entityId('usr')).min(1),
  interestRateBps: z.number().int().nullable(),
  isPrimary: z.boolean(),
  openedAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
});
export type Account = z.infer<typeof accountSchema>;

export const openAccountRequestSchema = z.object({
  productCode: shortTextSchema,
  currency: currencyCodeSchema,
  nickname: shortTextSchema.optional(),
  /** Additional holders turn a CURRENT account into a JOINT one. */
  additionalHolderEmails: z.array(z.email()).max(3).default([]),
});
export type OpenAccountRequest = z.infer<typeof openAccountRequestSchema>;

export const updateAccountRequestSchema = z.object({
  nickname: shortTextSchema.nullable().optional(),
  isPrimary: z.boolean().optional(),
});
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;

export const closeAccountRequestSchema = z.object({
  /** Any residual balance is swept here before the account is closed. */
  sweepToAccountId: entityId('acc').optional(),
  reason: shortTextSchema,
});
export type CloseAccountRequest = z.infer<typeof closeAccountRequestSchema>;

export const listAccountsQuerySchema = z.object({
  status: z.enum(AccountStatus).optional(),
  type: z.enum(AccountType).optional(),
  currency: currencyCodeSchema.optional(),
});
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;

/** Aggregate position across every account, converted to the customer's base currency. */
export const netWorthSchema = z.object({
  baseCurrency: currencyCodeSchema,
  totalAssets: moneySchema,
  totalLiabilities: moneySchema,
  net: moneySchema,
  byCurrency: z.array(z.object({ currency: currencyCodeSchema, total: moneySchema })),
  asOf: isoDateTimeSchema,
});
export type NetWorth = z.infer<typeof netWorthSchema>;
