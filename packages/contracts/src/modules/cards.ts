/**
 * Debit cards — issuing, lifecycle, controls and authorisation.
 *
 * The full PAN appears nowhere in this contract, not even as an optional field. Cards are
 * identified by a token; the last four digits are the only fragment a client ever holds,
 * and the sensitive-details endpoint returns a one-shot payload behind step-up auth.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  currencyCodeSchema,
  entityId,
  isoDateTimeSchema,
  last4Schema,
  mccSchema,
  moneySchema,
  pinSchema,
  positiveMoneySchema,
  shortTextSchema,
} from '../common/primitives.js';

export const CardFormat = { VIRTUAL: 'VIRTUAL', PHYSICAL: 'PHYSICAL' } as const;
export type CardFormat = (typeof CardFormat)[keyof typeof CardFormat];

export const CardScheme = { VISA: 'VISA', MASTERCARD: 'MASTERCARD' } as const;
export type CardScheme = (typeof CardScheme)[keyof typeof CardScheme];

export const CardStatus = {
  ORDERED: 'ORDERED',
  PRINTING: 'PRINTING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  INACTIVE: 'INACTIVE',
  ACTIVE: 'ACTIVE',
  FROZEN: 'FROZEN',
  LOST: 'LOST',
  STOLEN: 'STOLEN',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type CardStatus = (typeof CardStatus)[keyof typeof CardStatus];

export const CardTier = { STANDARD: 'STANDARD', PREMIUM: 'PREMIUM', METAL: 'METAL' } as const;
export type CardTier = (typeof CardTier)[keyof typeof CardTier];

/** Every channel a card can be used through. Each has an independent on/off switch. */
export const cardControlsSchema = z.object({
  onlinePayments: z.boolean(),
  contactless: z.boolean(),
  atmWithdrawals: z.boolean(),
  internationalPayments: z.boolean(),
  magstripe: z.boolean(),
  /** Per-transaction ceiling; null means the product limit applies. */
  perTransactionLimit: moneySchema.nullable(),
  dailySpendLimit: moneySchema.nullable(),
  monthlySpendLimit: moneySchema.nullable(),
  dailyAtmLimit: moneySchema.nullable(),
  blockedMccs: z.array(mccSchema),
  allowedCountries: z.array(z.string().length(2)),
});
export type CardControls = z.infer<typeof cardControlsSchema>;

export const cardSchema = z.object({
  id: entityId('crd'),
  accountId: entityId('acc'),
  format: z.enum(CardFormat),
  scheme: z.enum(CardScheme),
  tier: z.enum(CardTier),
  status: z.enum(CardStatus),
  nickname: shortTextSchema.nullable(),
  cardholderName: shortTextSchema,
  last4: last4Schema,
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2020).max(2099),
  currency: currencyCodeSchema,
  controls: cardControlsSchema,
  /** Virtual cards can be locked to a single merchant for subscription hygiene. */
  lockedMerchantId: z.string().nullable(),
  isDefault: z.boolean(),
  pinSet: z.boolean(),
  /** Set when the card is a replacement for another. */
  replacesCardId: entityId('crd').nullable(),
  orderedAt: isoDateTimeSchema,
  activatedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
});
export type Card = z.infer<typeof cardSchema>;

export const issueCardRequestSchema = z.object({
  accountId: entityId('acc'),
  format: z.enum(CardFormat),
  tier: z.enum(CardTier).default(CardTier.STANDARD),
  nickname: shortTextSchema.optional(),
  /** Required for PHYSICAL: where the card is posted. */
  deliveryAddressOverride: z.boolean().default(false),
});
export type IssueCardRequest = z.infer<typeof issueCardRequestSchema>;

export const activateCardRequestSchema = z.object({
  last4: last4Schema,
  pin: pinSchema,
});

export const setCardPinRequestSchema = z.object({ pin: pinSchema });

export const reportCardRequestSchema = z.object({
  reason: z.enum(['LOST', 'STOLEN', 'DAMAGED', 'NOT_RECEIVED', 'FRAUD']),
  detail: shortTextSchema.optional(),
  orderReplacement: z.boolean().default(true),
});
export type ReportCardRequest = z.infer<typeof reportCardRequestSchema>;

/**
 * One-shot sensitive payload. Returned only behind step-up auth, never cached, and the
 * client is expected to clear it from memory after a short display window.
 */
export const cardSensitiveDetailsSchema = z.object({
  data: z.object({
    pan: z.string(),
    cvv: z.string(),
    expiry: z.string(),
    cardholderName: shortTextSchema,
    /** Server-side expiry of this payload — the UI counts down against it. */
    validUntil: isoDateTimeSchema,
  }),
});
export type CardSensitiveDetails = z.infer<typeof cardSensitiveDetailsSchema>;

// --- Authorisations -------------------------------------------------------

export const AuthorisationStatus = {
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  REVERSED: 'REVERSED',
  CAPTURED: 'CAPTURED',
  EXPIRED: 'EXPIRED',
} as const;
export type AuthorisationStatus = (typeof AuthorisationStatus)[keyof typeof AuthorisationStatus];

export const DeclineReason = {
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  CARD_FROZEN: 'CARD_FROZEN',
  CARD_EXPIRED: 'CARD_EXPIRED',
  CARD_NOT_ACTIVATED: 'CARD_NOT_ACTIVATED',
  CHANNEL_DISABLED: 'CHANNEL_DISABLED',
  COUNTRY_BLOCKED: 'COUNTRY_BLOCKED',
  MERCHANT_BLOCKED: 'MERCHANT_BLOCKED',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  SUSPECTED_FRAUD: 'SUSPECTED_FRAUD',
  INCORRECT_PIN: 'INCORRECT_PIN',
  ISSUER_UNAVAILABLE: 'ISSUER_UNAVAILABLE',
} as const;
export type DeclineReason = (typeof DeclineReason)[keyof typeof DeclineReason];

export const cardAuthorisationSchema = z.object({
  id: entityId('aut'),
  cardId: entityId('crd'),
  accountId: entityId('acc'),
  status: z.enum(AuthorisationStatus),
  amount: positiveMoneySchema,
  /** Amount in the merchant's currency before conversion. */
  originalAmount: moneySchema.nullable(),
  merchantName: shortTextSchema,
  merchantCountry: z.string().length(2),
  mcc: mccSchema,
  channel: z.enum(['ONLINE', 'CONTACTLESS', 'CHIP', 'MAGSTRIPE', 'ATM', 'RECURRING']),
  declineReason: z.enum(DeclineReason).nullable(),
  holdId: entityId('hld').nullable(),
  transactionId: entityId('txn').nullable(),
  threeDsChallenged: z.boolean(),
  authorisedAt: isoDateTimeSchema,
  capturedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
});
export type CardAuthorisation = z.infer<typeof cardAuthorisationSchema>;

export const listAuthorisationsQuerySchema = cursorQuerySchema.extend({
  cardId: entityId('crd').optional(),
  status: z.enum(AuthorisationStatus).optional(),
});
