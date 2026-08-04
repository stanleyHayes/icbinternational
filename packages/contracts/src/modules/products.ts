/**
 * Product catalogue, pricing and limits.
 *
 * Products are effective-dated. Repricing a product creates a new version rather than
 * editing the old one, so an account opened last year keeps the terms it was sold — and
 * a statement produced today can still explain a fee charged under the previous version.
 */

import { z } from 'zod';

import {
  basisPointsSchema,
  currencyCodeSchema,
  isoDateSchema,
  isoDateTimeSchema,
  mediumTextSchema,
  moneySchema,
  shortTextSchema,
} from '../common/primitives.js';

import { AccountType } from './accounts.js';

export const FeeKind = {
  MONTHLY_MAINTENANCE: 'MONTHLY_MAINTENANCE',
  /**
   * Priced at zero by every current product, but the catalogue needs the vocabulary to
   * say so. Without a member here an internal transfer is free because the enum has no
   * word for it, which is a hole rather than a decision.
   */
  INTERNAL_TRANSFER: 'INTERNAL_TRANSFER',
  ATM_DOMESTIC: 'ATM_DOMESTIC',
  ATM_INTERNATIONAL: 'ATM_INTERNATIONAL',
  DOMESTIC_TRANSFER: 'DOMESTIC_TRANSFER',
  INTERNATIONAL_TRANSFER: 'INTERNATIONAL_TRANSFER',
  FX_MARKUP: 'FX_MARKUP',
  CARD_ISSUANCE: 'CARD_ISSUANCE',
  CARD_REPLACEMENT: 'CARD_REPLACEMENT',
  RETURNED_PAYMENT: 'RETURNED_PAYMENT',
  UNARRANGED_OVERDRAFT: 'UNARRANGED_OVERDRAFT',
  LATE_PAYMENT: 'LATE_PAYMENT',
  STATEMENT_COPY: 'STATEMENT_COPY',
  ACCOUNT_CLOSURE: 'ACCOUNT_CLOSURE',
} as const;
export type FeeKind = (typeof FeeKind)[keyof typeof FeeKind];

export const feeScheduleEntrySchema = z.object({
  kind: z.enum(FeeKind),
  label: shortTextSchema,
  /** A fee is a flat amount, a rate in basis points, or both with a floor and cap. */
  flatAmount: moneySchema.nullable(),
  rateBps: basisPointsSchema.nullable(),
  minAmount: moneySchema.nullable(),
  maxAmount: moneySchema.nullable(),
  /** Number of free uses per calendar month before the fee applies. */
  freeAllowancePerMonth: z.number().int().min(0),
  waivedForTiers: z.array(shortTextSchema),
});
export type FeeScheduleEntry = z.infer<typeof feeScheduleEntrySchema>;

export const interestTierSchema = z.object({
  /** Inclusive lower bound of the balance band. */
  fromAmount: moneySchema,
  toAmount: moneySchema.nullable(),
  annualRateBps: basisPointsSchema,
});
export type InterestTier = z.infer<typeof interestTierSchema>;

export const limitMatrixSchema = z.object({
  perTransaction: moneySchema.nullable(),
  daily: moneySchema.nullable(),
  monthly: moneySchema.nullable(),
  dailyCount: z.number().int().nullable(),
});
export type LimitMatrix = z.infer<typeof limitMatrixSchema>;

export const productSchema = z.object({
  code: shortTextSchema,
  version: z.number().int().positive(),
  name: shortTextSchema,
  tagline: shortTextSchema,
  description: mediumTextSchema,
  accountType: z.enum(AccountType),
  currencies: z.array(currencyCodeSchema).min(1),
  minKycTier: z.number().int().min(0).max(3),
  minOpeningBalance: moneySchema,
  minBalance: moneySchema,
  monthlyFee: moneySchema,
  creditInterestTiers: z.array(interestTierSchema),
  debitInterestBps: basisPointsSchema.nullable(),
  fees: z.array(feeScheduleEntrySchema),
  limits: z.object({
    internalTransfer: limitMatrixSchema,
    domesticTransfer: limitMatrixSchema,
    internationalTransfer: limitMatrixSchema,
    cardSpend: limitMatrixSchema,
    atmWithdrawal: limitMatrixSchema,
  }),
  features: z.array(shortTextSchema),
  active: z.boolean(),
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable(),
});
export type Product = z.infer<typeof productSchema>;

/** What the customer has left of a limit right now — surfaced before they hit it. */
export const limitUsageSchema = z.object({
  scope: shortTextSchema,
  limit: moneySchema,
  used: moneySchema,
  remaining: moneySchema,
  countLimit: z.number().int().nullable(),
  countUsed: z.number().int(),
  resetsAt: isoDateTimeSchema,
});
export type LimitUsage = z.infer<typeof limitUsageSchema>;
