/**
 * Bill payments, top-ups, peer requests and direct-debit mandates.
 *
 * Biller calls go through a simulated rail that fails realistically. When a biller
 * rejects after the debit has posted, the reversal is automatic and happens inside the
 * same job — a customer must never be left short because a third party timed out.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  entityId,
  isoDateTimeSchema,
  mediumTextSchema,
  moneySchema,
  positiveMoneySchema,
  referenceSchema,
  shortTextSchema,
} from '../common/primitives.js';

export const BillerCategory = {
  ELECTRICITY: 'ELECTRICITY',
  WATER: 'WATER',
  GAS: 'GAS',
  INTERNET: 'INTERNET',
  MOBILE: 'MOBILE',
  TV: 'TV',
  INSURANCE: 'INSURANCE',
  COUNCIL_TAX: 'COUNCIL_TAX',
  EDUCATION: 'EDUCATION',
  CHARITY: 'CHARITY',
  OTHER: 'OTHER',
} as const;
export type BillerCategory = (typeof BillerCategory)[keyof typeof BillerCategory];

export const billerSchema = z.object({
  id: z.string(),
  name: shortTextSchema,
  category: z.enum(BillerCategory),
  logoUrl: z.url().nullable(),
  /** Regex the customer's account number with this biller must satisfy. */
  accountNumberPattern: z.string(),
  accountNumberLabel: shortTextSchema,
  minAmount: positiveMoneySchema,
  maxAmount: positiveMoneySchema,
  fee: moneySchema,
  /** Whether the rail can confirm the payee's name before the debit. */
  supportsValidation: z.boolean(),
  active: z.boolean(),
});
export type Biller = z.infer<typeof billerSchema>;

export const BillPaymentStatus = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
} as const;
export type BillPaymentStatus = (typeof BillPaymentStatus)[keyof typeof BillPaymentStatus];

export const billPaymentSchema = z.object({
  id: z.string(),
  billerId: z.string(),
  billerName: shortTextSchema,
  status: z.enum(BillPaymentStatus),
  sourceAccountId: entityId('acc'),
  customerReference: shortTextSchema,
  amount: moneySchema,
  fee: moneySchema,
  /** Token returned by the biller on success — the customer's proof of payment. */
  billerReceipt: z.string().nullable(),
  failureReason: shortTextSchema.nullable(),
  transactionId: entityId('txn').nullable(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type BillPayment = z.infer<typeof billPaymentSchema>;

export const createBillPaymentRequestSchema = z.object({
  billerId: z.string(),
  sourceAccountId: entityId('acc'),
  customerReference: shortTextSchema,
  amount: positiveMoneySchema,
  saveBiller: z.boolean().default(false),
  nickname: shortTextSchema.optional(),
});
export type CreateBillPaymentRequest = z.infer<typeof createBillPaymentRequestSchema>;

export const createTopUpRequestSchema = z.object({
  provider: shortTextSchema,
  phone: z.string().min(6),
  bundle: z.enum(['AIRTIME', 'DATA']),
  bundleCode: shortTextSchema.optional(),
  amount: positiveMoneySchema,
  sourceAccountId: entityId('acc'),
});
export type CreateTopUpRequest = z.infer<typeof createTopUpRequestSchema>;

// --- Payment requests -----------------------------------------------------

export const PaymentRequestStatus = {
  OPEN: 'OPEN',
  PAID: 'PAID',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentRequestStatus = (typeof PaymentRequestStatus)[keyof typeof PaymentRequestStatus];

export const paymentRequestSchema = z.object({
  id: z.string(),
  status: z.enum(PaymentRequestStatus),
  requesterName: shortTextSchema,
  amount: moneySchema,
  note: mediumTextSchema.nullable(),
  /** Shareable link and the QR payload that encodes it. */
  shareUrl: z.url(),
  qrPayload: z.string(),
  destinationAccountId: entityId('acc'),
  paidByName: shortTextSchema.nullable(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  paidAt: isoDateTimeSchema.nullable(),
});
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export const createPaymentRequestSchema = z.object({
  destinationAccountId: entityId('acc'),
  amount: positiveMoneySchema,
  note: mediumTextSchema.optional(),
  expiresInHours: z.number().int().min(1).max(720).default(72),
});
export type CreatePaymentRequestRequest = z.infer<typeof createPaymentRequestSchema>;

export const splitBillRequestSchema = z.object({
  destinationAccountId: entityId('acc'),
  totalAmount: positiveMoneySchema,
  note: mediumTextSchema.optional(),
  participants: z
    .array(
      z.object({
        name: shortTextSchema,
        email: z.email().optional(),
        shares: z.number().int().min(1).default(1),
      }),
    )
    .min(1)
    .max(20),
  /** When true the requester's own share is excluded from the requests sent out. */
  excludeSelf: z.boolean().default(true),
});
export type SplitBillRequest = z.infer<typeof splitBillRequestSchema>;

// --- Mandates -------------------------------------------------------------

export const MandateStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type MandateStatus = (typeof MandateStatus)[keyof typeof MandateStatus];

export const mandateSchema = z.object({
  id: z.string(),
  status: z.enum(MandateStatus),
  merchantName: shortTextSchema,
  merchantLogoUrl: z.url().nullable(),
  accountId: entityId('acc'),
  reference: referenceSchema,
  /** Null for variable-amount mandates such as a utility bill. */
  fixedAmount: moneySchema.nullable(),
  maxAmount: moneySchema.nullable(),
  frequency: shortTextSchema,
  lastCollectedAt: isoDateTimeSchema.nullable(),
  lastAmount: moneySchema.nullable(),
  nextExpectedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  cancelledAt: isoDateTimeSchema.nullable(),
});
export type Mandate = z.infer<typeof mandateSchema>;

export const listBillersQuerySchema = cursorQuerySchema.extend({
  category: z.enum(BillerCategory).optional(),
  search: z.string().trim().max(80).optional(),
});
