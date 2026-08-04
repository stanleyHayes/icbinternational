/**
 * Support tickets, disputes and fraud reports.
 *
 * A dispute is not a support ticket with a different label: it has a regulated clock, a
 * provisional-credit decision and a defined set of outcomes, each of which posts real
 * ledger entries. The two are modelled separately for exactly that reason.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  entityId,
  isoDateTimeSchema,
  longTextSchema,
  mediumTextSchema,
  moneySchema,
  shortTextSchema,
} from '../common/primitives.js';

// --- Tickets --------------------------------------------------------------

export const TicketStatus = {
  OPEN: 'OPEN',
  AWAITING_CUSTOMER: 'AWAITING_CUSTOMER',
  AWAITING_AGENT: 'AWAITING_AGENT',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const TicketPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TicketPriority = (typeof TicketPriority)[keyof typeof TicketPriority];

export const TicketTopic = {
  ACCOUNT: 'ACCOUNT',
  PAYMENTS: 'PAYMENTS',
  CARDS: 'CARDS',
  LENDING: 'LENDING',
  FRAUD: 'FRAUD',
  TECHNICAL: 'TECHNICAL',
  COMPLAINT: 'COMPLAINT',
  OTHER: 'OTHER',
} as const;
export type TicketTopic = (typeof TicketTopic)[keyof typeof TicketTopic];

export const ticketMessageSchema = z.object({
  id: z.string(),
  authorType: z.enum(['CUSTOMER', 'AGENT', 'SYSTEM']),
  authorName: shortTextSchema,
  body: longTextSchema,
  attachmentIds: z.array(entityId('doc')),
  sentAt: isoDateTimeSchema,
});
export type TicketMessage = z.infer<typeof ticketMessageSchema>;

export const ticketSchema = z.object({
  id: entityId('tkt'),
  subject: shortTextSchema,
  topic: z.enum(TicketTopic),
  status: z.enum(TicketStatus),
  priority: z.enum(TicketPriority),
  assignedAgentName: shortTextSchema.nullable(),
  messages: z.array(ticketMessageSchema),
  unreadCount: z.number().int(),
  /** When the bank has committed to respond by. Drives the agent SLA board. */
  slaDueAt: isoDateTimeSchema.nullable(),
  satisfactionRating: z.number().int().min(1).max(5).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const createTicketRequestSchema = z.object({
  subject: shortTextSchema,
  topic: z.enum(TicketTopic),
  body: longTextSchema,
  attachmentIds: z.array(entityId('doc')).max(5).default([]),
  relatedTransactionId: entityId('txn').optional(),
});
export type CreateTicketRequest = z.infer<typeof createTicketRequestSchema>;

export const postTicketMessageRequestSchema = z.object({
  body: longTextSchema,
  attachmentIds: z.array(entityId('doc')).max(5).default([]),
});

export const listTicketsQuerySchema = cursorQuerySchema.extend({
  status: z.enum(TicketStatus).optional(),
  topic: z.enum(TicketTopic).optional(),
});

// --- Disputes -------------------------------------------------------------

export const DisputeReason = {
  UNAUTHORISED: 'UNAUTHORISED',
  DUPLICATE_CHARGE: 'DUPLICATE_CHARGE',
  GOODS_NOT_RECEIVED: 'GOODS_NOT_RECEIVED',
  GOODS_NOT_AS_DESCRIBED: 'GOODS_NOT_AS_DESCRIBED',
  INCORRECT_AMOUNT: 'INCORRECT_AMOUNT',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  REFUND_NOT_RECEIVED: 'REFUND_NOT_RECEIVED',
  ATM_CASH_NOT_DISPENSED: 'ATM_CASH_NOT_DISPENSED',
  OTHER: 'OTHER',
} as const;
export type DisputeReason = (typeof DisputeReason)[keyof typeof DisputeReason];

export const DisputeStatus = {
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  EVIDENCE_REQUESTED: 'EVIDENCE_REQUESTED',
  REPRESENTED: 'REPRESENTED',
  ARBITRATION: 'ARBITRATION',
  WON: 'WON',
  LOST: 'LOST',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus];

export const disputeSchema = z.object({
  id: entityId('dsp'),
  transactionId: entityId('txn'),
  status: z.enum(DisputeStatus),
  reason: z.enum(DisputeReason),
  description: longTextSchema,
  disputedAmount: moneySchema,
  /** Credited while the case runs; reversed if the dispute is lost. */
  provisionalCredit: moneySchema.nullable(),
  provisionalCreditAt: isoDateTimeSchema.nullable(),
  evidenceIds: z.array(entityId('doc')),
  merchantResponse: mediumTextSchema.nullable(),
  outcomeSummary: mediumTextSchema.nullable(),
  timeline: z.array(
    z.object({ status: z.enum(DisputeStatus), at: isoDateTimeSchema, detail: shortTextSchema }),
  ),
  /** Regulatory deadline for the bank's decision. */
  decisionDueAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
});
export type Dispute = z.infer<typeof disputeSchema>;

export const createDisputeRequestSchema = z.object({
  transactionId: entityId('txn'),
  reason: z.enum(DisputeReason),
  description: longTextSchema,
  /** Partial disputes are allowed; omit to dispute the whole amount. */
  disputedAmount: moneySchema.optional(),
  evidenceIds: z.array(entityId('doc')).max(10).default([]),
  contactedMerchant: z.boolean(),
});
export type CreateDisputeRequest = z.infer<typeof createDisputeRequestSchema>;

export const createFraudReportRequestSchema = z.object({
  kind: z.enum(['CARD_FRAUD', 'ACCOUNT_TAKEOVER', 'PHISHING', 'SCAM_PAYMENT', 'IDENTITY_THEFT']),
  description: longTextSchema,
  transactionIds: z.array(entityId('txn')).default([]),
  /** Freezing is the safe default when a customer reports fraud. */
  freezeCards: z.boolean().default(true),
  freezeAccounts: z.boolean().default(false),
});
export type CreateFraudReportRequest = z.infer<typeof createFraudReportRequestSchema>;
