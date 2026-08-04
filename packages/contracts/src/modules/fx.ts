/**
 * Foreign exchange: rates, quotes and multi-currency wallets.
 *
 * A quote is a binding commitment for a short window. The customer sees the exact rate,
 * the exact spread and the exact amount they will receive *before* they authorise, and
 * the server refuses to execute against an expired quote rather than silently repricing.
 */

import { z } from 'zod';

import {
  basisPointsSchema,
  currencyCodeSchema,
  entityId,
  isoDateTimeSchema,
  moneySchema,
  positiveMoneySchema,
  rateSchema,
} from '../common/primitives.js';

export const fxRateSchema = z.object({
  from: currencyCodeSchema,
  to: currencyCodeSchema,
  /** Mid-market rate, before any customer spread. */
  mid: rateSchema,
  bid: rateSchema,
  ask: rateSchema,
  spreadBps: basisPointsSchema,
  /** Change against the previous close, in basis points. Negative means weaker. */
  changeBps: z.number().int(),
  asOf: isoDateTimeSchema,
});
export type FxRate = z.infer<typeof fxRateSchema>;

export const fxBoardSchema = z.object({
  base: currencyCodeSchema,
  rates: z.array(fxRateSchema),
  asOf: isoDateTimeSchema,
});
export type FxBoard = z.infer<typeof fxBoardSchema>;

export const fxQuoteRequestSchema = z
  .object({
    fromAccountId: entityId('acc'),
    toAccountId: entityId('acc'),
    /** Supply exactly one: fix what you spend, or fix what you receive. */
    sellAmount: positiveMoneySchema.optional(),
    buyAmount: positiveMoneySchema.optional(),
  })
  .refine((input) => Boolean(input.sellAmount) !== Boolean(input.buyAmount), {
    message: 'supply exactly one of sellAmount or buyAmount',
    path: ['sellAmount'],
  });
export type FxQuoteRequest = z.infer<typeof fxQuoteRequestSchema>;

export const fxQuoteSchema = z.object({
  id: entityId('qte'),
  from: currencyCodeSchema,
  to: currencyCodeSchema,
  sellAmount: moneySchema,
  buyAmount: moneySchema,
  rate: rateSchema,
  midRate: rateSchema,
  spreadBps: basisPointsSchema,
  /** The spread expressed as money, so the cost is never hidden in the rate. */
  spreadCost: moneySchema,
  fee: moneySchema,
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type FxQuote = z.infer<typeof fxQuoteSchema>;

export const executeFxRequestSchema = z.object({ quoteId: entityId('qte') });

export const fxAlertSchema = z.object({
  id: z.string(),
  from: currencyCodeSchema,
  to: currencyCodeSchema,
  direction: z.enum(['ABOVE', 'BELOW']),
  targetRate: rateSchema,
  active: z.boolean(),
  triggeredAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type FxAlert = z.infer<typeof fxAlertSchema>;

export const createFxAlertRequestSchema = fxAlertSchema.pick({
  from: true,
  to: true,
  direction: true,
  targetRate: true,
});
export type CreateFxAlertRequest = z.infer<typeof createFxAlertRequestSchema>;
