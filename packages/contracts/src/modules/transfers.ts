/**
 * Moving money out of an account: internal, domestic and international.
 *
 * The three rails differ in settlement time, cost and the identifiers they need, but the
 * customer-facing lifecycle is deliberately uniform — quote, review, authorise, track.
 * Every mutating endpoint here requires an `Idempotency-Key`.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  accountNumberSchema,
  bicSchema,
  countryCodeSchema,
  currencyCodeSchema,
  entityId,
  ibanSchema,
  isoDateSchema,
  isoDateTimeSchema,
  metadataSchema,
  moneySchema,
  positiveMoneySchema,
  referenceSchema,
  shortTextSchema,
  sortCodeSchema,
} from '../common/primitives.js';

export const TransferRail = {
  INTERNAL: 'INTERNAL',
  DOMESTIC_ACH: 'DOMESTIC_ACH',
  DOMESTIC_RTGS: 'DOMESTIC_RTGS',
  INTERNATIONAL_SWIFT: 'INTERNATIONAL_SWIFT',
} as const;
export type TransferRail = (typeof TransferRail)[keyof typeof TransferRail];

export const TransferStatus = {
  DRAFT: 'DRAFT',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  SCHEDULED: 'SCHEDULED',
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  SETTLED: 'SETTLED',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
} as const;
export type TransferStatus = (typeof TransferStatus)[keyof typeof TransferStatus];

/** Who pays the correspondent charges on an international payment. */
export const ChargeBearer = { OUR: 'OUR', SHA: 'SHA', BEN: 'BEN' } as const;
export type ChargeBearer = (typeof ChargeBearer)[keyof typeof ChargeBearer];

// --- Destinations ---------------------------------------------------------

export const internalDestinationSchema = z
  .object({
    kind: z.literal('INTERNAL'),
    /** Exactly one of these identifies the payee — enforced below, not merely documented. */
    accountId: entityId('acc').optional(),
    accountNumber: accountNumberSchema.optional(),
    email: z.email().optional(),
    handle: z
      .string()
      .regex(/^@[a-z0-9_]{3,20}$/)
      .optional(),
  })
  .refine(
    (input) =>
      [input.accountId, input.accountNumber, input.email, input.handle].filter(Boolean).length ===
      1,
    {
      // Accepting two identifiers means the server picks one. A caller could then show the
      // customer a confirmation screen naming one payee and pay a different one.
      message: 'supply exactly one of accountId, accountNumber, email or handle',
      path: ['accountId'],
    },
  );

export const domesticDestinationSchema = z.object({
  kind: z.literal('DOMESTIC'),
  accountName: shortTextSchema,
  accountNumber: accountNumberSchema,
  sortCode: sortCodeSchema,
  bankName: shortTextSchema.optional(),
});

export const internationalDestinationSchema = z.object({
  kind: z.literal('INTERNATIONAL'),
  accountName: shortTextSchema,
  iban: ibanSchema,
  bic: bicSchema,
  bankName: shortTextSchema,
  bankAddress: shortTextSchema.optional(),
  country: countryCodeSchema,
});

export const transferDestinationSchema = z.discriminatedUnion('kind', [
  internalDestinationSchema,
  domesticDestinationSchema,
  internationalDestinationSchema,
]);
export type TransferDestination = z.infer<typeof transferDestinationSchema>;

// --- Quote ----------------------------------------------------------------

export const transferQuoteRequestSchema = z.object({
  sourceAccountId: entityId('acc'),
  destination: transferDestinationSchema,
  amount: positiveMoneySchema,
  /** When true the payee receives exactly `amount` and fees are added on top. */
  amountIsReceiveSide: z.boolean().default(false),
  chargeBearer: z.enum(ChargeBearer).default(ChargeBearer.SHA),
});
export type TransferQuoteRequest = z.infer<typeof transferQuoteRequestSchema>;

export const transferQuoteSchema = z.object({
  id: entityId('qte'),
  rail: z.enum(TransferRail),
  debitAmount: moneySchema,
  creditAmount: moneySchema,
  fee: moneySchema,
  /** Present only on cross-currency transfers. */
  exchangeRate: z.string().nullable(),
  rateExpiresAt: isoDateTimeSchema.nullable(),
  estimatedArrival: isoDateTimeSchema,
  cutOffAt: isoDateTimeSchema.nullable(),
  requiresStepUp: z.boolean(),
  warnings: z.array(shortTextSchema),
  expiresAt: isoDateTimeSchema,
});
export type TransferQuote = z.infer<typeof transferQuoteSchema>;

// --- Execution ------------------------------------------------------------

export const createTransferRequestSchema = z.object({
  /** Binds the execution to a quote so the customer cannot be repriced mid-flow. */
  quoteId: entityId('qte'),
  reference: referenceSchema.optional(),
  /** Absent means "now"; a future date creates a SCHEDULED transfer. */
  executeOn: isoDateSchema.optional(),
  saveBeneficiary: z.boolean().default(false),
  beneficiaryNickname: shortTextSchema.optional(),
  metadata: metadataSchema,
});
export type CreateTransferRequest = z.infer<typeof createTransferRequestSchema>;

export const transferEventSchema = z.object({
  status: z.enum(TransferStatus),
  at: isoDateTimeSchema,
  detail: shortTextSchema,
});
export type TransferEvent = z.infer<typeof transferEventSchema>;

export const transferSchema = z.object({
  id: entityId('trf'),
  rail: z.enum(TransferRail),
  status: z.enum(TransferStatus),
  sourceAccountId: entityId('acc'),
  destination: transferDestinationSchema,
  debitAmount: moneySchema,
  creditAmount: moneySchema,
  fee: moneySchema,
  exchangeRate: z.string().nullable(),
  reference: referenceSchema.nullable(),
  /** Rail tracking identifier — a UETR-style string for SWIFT, a batch id for ACH. */
  railReference: z.string().nullable(),
  /** Populated when the rail returns the payment. */
  returnCode: z.string().nullable(),
  returnReason: shortTextSchema.nullable(),
  journalEntryId: entityId('jnl').nullable(),
  timeline: z.array(transferEventSchema),
  estimatedArrival: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  settledAt: isoDateTimeSchema.nullable(),
});
export type Transfer = z.infer<typeof transferSchema>;

export const listTransfersQuerySchema = cursorQuerySchema.extend({
  status: z.enum(TransferStatus).optional(),
  rail: z.enum(TransferRail).optional(),
  sourceAccountId: entityId('acc').optional(),
});
export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;

// --- Beneficiaries --------------------------------------------------------

export const NameCheckResult = {
  MATCH: 'MATCH',
  CLOSE_MATCH: 'CLOSE_MATCH',
  NO_MATCH: 'NO_MATCH',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;
export type NameCheckResult = (typeof NameCheckResult)[keyof typeof NameCheckResult];

export const beneficiarySchema = z.object({
  id: entityId('ben'),
  nickname: shortTextSchema,
  destination: transferDestinationSchema,
  currency: currencyCodeSchema,
  nameCheck: z.enum(NameCheckResult),
  nameCheckSuggestion: shortTextSchema.nullable(),
  isFavourite: z.boolean(),
  /** New payees are held for a cooling-off window before large payments are allowed. */
  trustedFrom: isoDateTimeSchema.nullable(),
  lastUsedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Beneficiary = z.infer<typeof beneficiarySchema>;

/** Request for `POST /beneficiaries/verify-name` — Confirmation of Payee. */
export const verifyPayeeNameRequestSchema = z.object({
  destination: transferDestinationSchema,
  accountName: shortTextSchema,
});
export type VerifyPayeeNameRequest = z.infer<typeof verifyPayeeNameRequestSchema>;

export const verifyPayeeNameResponseSchema = z.object({
  result: z.enum(NameCheckResult),
  /** The name the receiving bank holds, when it differs but is close. */
  suggestion: shortTextSchema.nullable(),
});
export type VerifyPayeeNameResponse = z.infer<typeof verifyPayeeNameResponseSchema>;

/** Partial update. At least one field must be present — an empty PATCH is a client bug. */
export const updateBeneficiaryRequestSchema = z
  .object({ nickname: shortTextSchema.optional(), isFavourite: z.boolean().optional() })
  .refine((input) => input.nickname !== undefined || input.isFavourite !== undefined, {
    message: 'supply at least one field to update',
  });
export type UpdateBeneficiaryRequest = z.infer<typeof updateBeneficiaryRequestSchema>;

export const createBeneficiaryRequestSchema = z.object({
  nickname: shortTextSchema,
  destination: transferDestinationSchema,
  currency: currencyCodeSchema,
  isFavourite: z.boolean().default(false),
});
export type CreateBeneficiaryRequest = z.infer<typeof createBeneficiaryRequestSchema>;

// --- Scheduled and recurring ---------------------------------------------

export const RecurrenceFrequency = {
  ONCE: 'ONCE',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  FORTNIGHTLY: 'FORTNIGHTLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
} as const;
export type RecurrenceFrequency = (typeof RecurrenceFrequency)[keyof typeof RecurrenceFrequency];

export const TransferOrderStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILING: 'FAILING',
} as const;
export type TransferOrderStatus = (typeof TransferOrderStatus)[keyof typeof TransferOrderStatus];

export const transferOrderSchema = z.object({
  id: entityId('tro'),
  name: shortTextSchema,
  status: z.enum(TransferOrderStatus),
  sourceAccountId: entityId('acc'),
  beneficiaryId: entityId('ben'),
  amount: positiveMoneySchema,
  reference: referenceSchema.nullable(),
  frequency: z.enum(RecurrenceFrequency),
  /** Day of month 1–31; month-ends clamp rather than skip. */
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  dayOfWeek: z.number().int().min(1).max(7).nullable(),
  startsOn: isoDateSchema,
  endsOn: isoDateSchema.nullable(),
  maxOccurrences: z.number().int().positive().nullable(),
  occurrencesRun: z.number().int(),
  nextRunAt: isoDateTimeSchema.nullable(),
  lastRunAt: isoDateTimeSchema.nullable(),
  consecutiveFailures: z.number().int(),
  createdAt: isoDateTimeSchema,
});
export type TransferOrder = z.infer<typeof transferOrderSchema>;

export const createTransferOrderRequestSchema = transferOrderSchema
  .pick({
    name: true,
    sourceAccountId: true,
    beneficiaryId: true,
    amount: true,
    frequency: true,
    startsOn: true,
  })
  .extend({
    reference: referenceSchema.optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    endsOn: isoDateSchema.optional(),
    maxOccurrences: z.number().int().positive().optional(),
  });
export type CreateTransferOrderRequest = z.infer<typeof createTransferOrderRequestSchema>;

// --- Bulk -----------------------------------------------------------------

export const bulkTransferRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  accountName: shortTextSchema,
  accountNumber: accountNumberSchema,
  sortCode: sortCodeSchema,
  amount: positiveMoneySchema,
  reference: referenceSchema.optional(),
  status: z.enum(['VALID', 'INVALID', 'PENDING', 'SETTLED', 'FAILED']),
  error: shortTextSchema.nullable(),
});
export type BulkTransferRow = z.infer<typeof bulkTransferRowSchema>;

export const bulkTransferSchema = z.object({
  id: z.string(),
  sourceAccountId: entityId('acc'),
  fileName: shortTextSchema,
  status: z.enum(['VALIDATING', 'AWAITING_APPROVAL', 'PROCESSING', 'COMPLETED', 'REJECTED']),
  totalRows: z.number().int(),
  validRows: z.number().int(),
  failedRows: z.number().int(),
  totalAmount: moneySchema,
  rows: z.array(bulkTransferRowSchema),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type BulkTransfer = z.infer<typeof bulkTransferSchema>;
