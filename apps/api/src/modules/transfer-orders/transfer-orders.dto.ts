/**
 * Request shapes the frozen contract does not name.
 *
 * `packages/contracts` defines a standing order and the body that creates one. It does not
 * define the list query, the pause body or the amendment body — the routes exist and
 * `packages/api-client` already calls all three, so the schemas have to exist somewhere.
 *
 * They are built from the contract's own primitives rather than reinvented, so an account
 * id is validated the same way here as everywhere else, and they live in the API because
 * inventing shapes inside a frozen package is how a contract stops being frozen.
 * `docs/HANDOFFS.md` carries the request to promote them.
 */

import { z } from 'zod';

import {
  createTransferOrderRequestSchema,
  cursorQuerySchema,
  entityId,
  isoDateSchema,
  TransferOrderStatus,
} from '@reliance/contracts';

/** Filters on the customer's standing-order list. */
export const listTransferOrdersQuerySchema = cursorQuerySchema.extend({
  status: z.enum(TransferOrderStatus).optional(),
  sourceAccountId: entityId('acc').optional(),
});
export type ListTransferOrdersQuery = z.infer<typeof listTransferOrdersQuerySchema>;

/**
 * An amendment to a live standing order.
 *
 * Five fields, and the omissions are the design. The payee and the cadence are not
 * amendable: changing either produces a different instruction from the one the customer
 * agreed to, and "my rent went up" must never share a code path with "my rent goes
 * somewhere else now". A customer who wants a different payee or a different frequency
 * sets up a new order and stops this one, which is two deliberate acts rather than one
 * ambiguous one.
 */
export const updateTransferOrderRequestSchema = createTransferOrderRequestSchema
  .pick({ name: true, amount: true, reference: true, endsOn: true, maxOccurrences: true })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one field to change',
  });
export type UpdateTransferOrderRequest = z.infer<typeof updateTransferOrderRequestSchema>;

/**
 * Pausing or resuming the whole schedule.
 *
 * `resumeOn` is part of the contract's request shape and is deliberately refused rather
 * than stored — see `TransferOrderLifecycleService.setPaused` for why a date nothing acts
 * on is worse than an honest refusal.
 */
export const pauseTransferOrderRequestSchema = z.object({
  paused: z.boolean(),
  resumeOn: isoDateSchema.optional(),
});
export type PauseTransferOrderRequest = z.infer<typeof pauseTransferOrderRequestSchema>;
