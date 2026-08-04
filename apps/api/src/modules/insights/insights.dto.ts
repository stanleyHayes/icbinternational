import { z } from 'zod';

import { currencyCodeSchema, entityId, isoDateTimeSchema } from '@reliance/contracts';

import { CashflowGranularity } from './cashflow-buckets.js';

/**
 * Request schemas for the insights routes.
 *
 * The frozen contract defines every insights *response* — `spendByCategorySchema`,
 * `cashflowSchema`, `subscriptionSchema`, `budgetSchema` — but no query schema for any of
 * them, so these are declared locally and built from contract primitives so the vocabulary
 * still matches. A proposal to move them into `packages/contracts` is logged in
 * `docs/CONTRACT_CHANGES.md`; when it lands these are deleted, not rewritten.
 */

/** Shared by every insight: the window, optionally narrowed to one account. */
const periodQuery = z
  .object({
    accountId: entityId('acc').optional(),
    currency: currencyCodeSchema,
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
  })
  .refine((query) => query.from <= query.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });

export const spendQuerySchema = periodQuery;
export type SpendQueryDto = z.infer<typeof spendQuerySchema>;

/**
 * Cashflow requires an account.
 *
 * A closing balance belongs to an account, not to a person: adding a current account's
 * balance to a savings pot's produces a number that appears on no statement and answers
 * no question the customer asked.
 */
export const cashflowQuerySchema = z
  .object({
    accountId: entityId('acc'),
    currency: currencyCodeSchema,
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    granularity: z.enum(CashflowGranularity).default(CashflowGranularity.MONTH),
  })
  .refine((query) => query.from <= query.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });
export type CashflowQueryDto = z.infer<typeof cashflowQuerySchema>;

/**
 * Subscriptions look back a year by default.
 *
 * Long enough to find every weekly, monthly and quarterly subscription three times over,
 * which is the detection threshold. Annual subscriptions need three years of history and
 * the caller has to ask for it explicitly — scanning a decade on every page load to catch
 * the rare annual case is not a trade worth making by default.
 */
export const subscriptionQuerySchema = z.object({
  accountId: entityId('acc').optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type SubscriptionQueryDto = z.infer<typeof subscriptionQuerySchema>;
