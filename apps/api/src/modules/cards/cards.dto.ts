/**
 * Request shapes the frozen contract does not name.
 *
 * `packages/contracts` defines the card, its controls and the bodies for issuing,
 * activating and reporting. It does not define the *query* on the card list, the rename
 * body, or the merchant-lock body — the routes exist, so the schemas have to as well.
 *
 * They are built from the contract's own primitives rather than reinvented, so a card id
 * is validated the same way here as it is everywhere else, and they live in the API
 * because inventing shapes inside a frozen package is how a contract stops being frozen.
 */

import { z } from 'zod';

import {
  cardControlsSchema,
  CardStatus,
  cursorQuerySchema,
  AuthorisationStatus,
  entityId,
  shortTextSchema,
} from '@reliance/contracts';

/** Filters on the card wall. */
export const listCardsQuerySchema = cursorQuerySchema.extend({
  accountId: entityId('acc').optional(),
  status: z.enum(CardStatus).optional(),
});
export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;

/**
 * The two things a customer may change about a card without touching its controls.
 *
 * `nickname` is nullable so a name can be cleared, and both fields are optional so an
 * absent key means "leave it alone" rather than "set it to nothing".
 */
export const updateCardRequestSchema = z
  .object({
    nickname: shortTextSchema.nullable().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send a nickname or a default flag to change.',
  });
export type UpdateCardRequest = z.infer<typeof updateCardRequestSchema>;

/** The full control set, replaced wholesale. Mirrors the client's `setControls`. */
export const setCardControlsRequestSchema = cardControlsSchema;

/** Pinning a virtual card to one merchant, or releasing it. */
export const lockCardToMerchantRequestSchema = z.object({
  /** Null releases the lock and lets the card pay anywhere its controls allow. */
  merchantId: shortTextSchema.nullable(),
});
export type LockCardToMerchantRequest = z.infer<typeof lockCardToMerchantRequestSchema>;

/** Filters on the authorisation feed, cards-wide. */
export const listCardAuthorisationsQuerySchema = cursorQuerySchema.extend({
  cardId: entityId('crd').optional(),
  status: z.enum(AuthorisationStatus).optional(),
});
export type ListCardAuthorisationsQuery = z.infer<typeof listCardAuthorisationsQuerySchema>;

/** Cursor paging on one card's statement rows. */
export const cardTransactionsQuerySchema = cursorQuerySchema;
export type CardTransactionsQuery = z.infer<typeof cardTransactionsQuerySchema>;
