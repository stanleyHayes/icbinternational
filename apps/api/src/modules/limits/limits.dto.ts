import { z } from 'zod';

import {
  currencyCodeSchema,
  isoDateTimeSchema,
  mediumTextSchema,
  positiveMoneySchema,
  shortTextSchema,
} from '@reliance/contracts';

import { LimitChannel } from './limit-channel.js';

/**
 * Request and response shapes for the limits admin surface.
 *
 * The contracts package is frozen, so these live in the API until the proposed contract
 * additions (`limitOverrideSchema`, `createLimitOverrideRequestSchema`, the
 * `/admin/limits/overrides` routes) land. They are written with contract primitives so
 * the move is a cut-and-paste, not a rewrite.
 */

/** The five scopes a product caps, as `Product.limits` names them. */
export const limitScopeSchema = z.enum([
  'internalTransfer',
  'domesticTransfer',
  'internationalTransfer',
  'cardSpend',
  'atmWithdrawal',
]);

/** Grant a temporary deviation from an account's effective limit. */
export const createLimitOverrideRequestSchema = z
  .object({
    accountId: shortTextSchema,
    scope: limitScopeSchema,
    /** Omit to cover every channel of the scope. */
    channel: z.enum(LimitChannel).optional(),
    currency: currencyCodeSchema,
    perTransaction: positiveMoneySchema.optional(),
    daily: positiveMoneySchema.optional(),
    monthly: positiveMoneySchema.optional(),
    dailyCount: z.number().int().min(1).optional(),
    /** Why the grant exists. Investigators read this; "customer asked nicely" is not one. */
    reason: mediumTextSchema,
    expiresAt: isoDateTimeSchema,
  })
  .refine(
    (request) =>
      request.perTransaction !== undefined ||
      request.daily !== undefined ||
      request.monthly !== undefined ||
      request.dailyCount !== undefined,
    { message: 'An override that caps nothing changes nothing', path: ['daily'] },
  );
export type CreateLimitOverrideRequest = z.infer<typeof createLimitOverrideRequestSchema>;
