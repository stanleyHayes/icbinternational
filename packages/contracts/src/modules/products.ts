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

/**
 * One product's interest rates, as the public rates page renders them.
 *
 * A projection of `productSchema`, not a second source: the API derives it from the same
 * catalogue read that serves `/public/products`, so a rate cannot differ between the two
 * endpoints. It lives here rather than beside the controller because the marketing site
 * parses this exact shape, and the last time it did not, the two sides drifted — the site
 * validated against a hand-written schema of savings/lending arrays that the API has never
 * returned, so every response failed validation and the page silently fell back to showing
 * no rate at all.
 */
export const productRatesSchema = z.object({
  code: shortTextSchema,
  name: shortTextSchema,
  accountType: z.enum(AccountType),
  /** Credit bands, ordered by `fromAmount` ascending. Empty on products that pay nothing. */
  creditInterestTiers: z.array(interestTierSchema),
  /** Arranged overdraft rate. Null on products that cannot go overdrawn. */
  debitInterestBps: basisPointsSchema.nullable(),
  /**
   * The date this version of the product's rates took effect.
   *
   * Carried on the projection rather than looked up separately because a published rate
   * has to be shown with the date it came into force — the rate tables print it, and a
   * figure without one is not a quotation a customer can check against their statement.
   */
  effectiveFrom: isoDateSchema,
});
export type ProductRates = z.infer<typeof productRatesSchema>;

/**
 * One product's charges, as the public fees page renders them.
 *
 * The regulator expects the fee schedule to be a single document rather than something a
 * customer assembles by opening five product pages, so the endpoint groups every charge
 * under the product that levies it. Like `productRatesSchema`, this is a projection of the
 * same catalogue read, declared here so the API and the site cannot disagree about it.
 */
export const productFeesSchema = z.object({
  code: shortTextSchema,
  name: shortTextSchema,
  monthlyFee: moneySchema,
  fees: z.array(feeScheduleEntrySchema),
});
export type ProductFees = z.infer<typeof productFeesSchema>;

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
