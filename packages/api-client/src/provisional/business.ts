/**
 * Provisional shapes for the business-banking surface.
 *
 * `routes.business` exists in the frozen contract but no `modules/business.ts` does, so
 * every shape here is a gap-filler. See `./README.md`.
 */

import { z } from 'zod';

import {
  entityId,
  isoDateSchema,
  isoDateTimeSchema,
  mediumTextSchema,
  moneySchema,
  positiveMoneySchema,
  shortTextSchema,
} from '@reliance/contracts';

/** What a team member is allowed to do inside a business account. */
export const BusinessRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  APPROVER: 'APPROVER',
  INITIATOR: 'INITIATOR',
  BOOKKEEPER: 'BOOKKEEPER',
  VIEWER: 'VIEWER',
} as const;
/** Business team role. */
export type BusinessRole = (typeof BusinessRole)[keyof typeof BusinessRole];

/** Lifecycle of an invitation to join a business account. */
export const BusinessMemberStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REMOVED: 'REMOVED',
} as const;
/** Business member status. */
export type BusinessMemberStatus = (typeof BusinessMemberStatus)[keyof typeof BusinessMemberStatus];

/** A person on a business account. */
export const businessMemberSchema = z.object({
  id: z.string(),
  userId: entityId('usr').nullable(),
  email: z.email(),
  fullName: shortTextSchema,
  role: z.enum(BusinessRole),
  status: z.enum(BusinessMemberStatus),
  /** Accounts this member can see. Empty means every account on the business. */
  accountIds: z.array(entityId('acc')),
  /** Payments above this need a second approver, whatever the member's role. */
  approvalThreshold: moneySchema.nullable(),
  invitedAt: isoDateTimeSchema,
  joinedAt: isoDateTimeSchema.nullable(),
  lastActiveAt: isoDateTimeSchema.nullable(),
});
/** A business team member. */
export type BusinessMember = z.infer<typeof businessMemberSchema>;

/** Body of an invitation. */
export const inviteBusinessMemberRequestSchema = z.object({
  email: z.email(),
  fullName: shortTextSchema,
  role: z.enum(BusinessRole),
  accountIds: z.array(entityId('acc')).default([]),
  approvalThreshold: positiveMoneySchema.optional(),
});
/** Invite-member request. */
export type InviteBusinessMemberRequest = z.infer<typeof inviteBusinessMemberRequestSchema>;

/**
 * A payment waiting on a second pair of eyes.
 *
 * Separate from the admin console's `approvalRequestSchema`: this one is decided by the
 * *customer's* colleagues, not by bank staff, and it never exposes staff identities.
 */
export const businessApprovalSchema = z.object({
  id: z.string(),
  kind: z.enum(['TRANSFER', 'BULK_TRANSFER', 'PAYROLL', 'MEMBER_CHANGE', 'LIMIT_CHANGE']),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']),
  amount: moneySchema.nullable(),
  summary: shortTextSchema,
  requestedByName: shortTextSchema,
  /** Approvers who have already signed, so the UI can show "1 of 2". */
  approvedByNames: z.array(shortTextSchema),
  approvalsRequired: z.number().int().positive(),
  decisionNote: mediumTextSchema.nullable(),
  targetId: z.string(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  decidedAt: isoDateTimeSchema.nullable(),
});
/** A pending business approval. */
export type BusinessApproval = z.infer<typeof businessApprovalSchema>;

/** Body of an approve/reject decision. */
export const decideBusinessApprovalRequestSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: mediumTextSchema.optional(),
});
/** Business approval decision. */
export type DecideBusinessApprovalRequest = z.infer<typeof decideBusinessApprovalRequestSchema>;

/** A single billable line on an invoice. */
export const invoiceLineSchema = z.object({
  description: shortTextSchema,
  quantity: z.number().int().positive(),
  unitPrice: moneySchema,
  taxRateBps: z.number().int().min(0).max(10_000),
  lineTotal: moneySchema,
});
/** An invoice line. */
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

/** An invoice raised by the business against one of its own customers. */
export const invoiceSchema = z.object({
  id: z.string(),
  number: shortTextSchema,
  status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID']),
  customerName: shortTextSchema,
  customerEmail: z.email().nullable(),
  lines: z.array(invoiceLineSchema).min(1),
  subtotal: moneySchema,
  tax: moneySchema,
  total: moneySchema,
  amountPaid: moneySchema,
  amountDue: moneySchema,
  /** Hosted payment page the business shares with its customer. */
  payUrl: z.url(),
  settlementAccountId: entityId('acc'),
  notes: mediumTextSchema.nullable(),
  issuedOn: isoDateSchema,
  dueOn: isoDateSchema,
  paidAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
/** A business invoice. */
export type Invoice = z.infer<typeof invoiceSchema>;

/** Body of an invoice creation. */
export const createInvoiceRequestSchema = z.object({
  customerName: shortTextSchema,
  customerEmail: z.email().optional(),
  settlementAccountId: entityId('acc'),
  lines: z
    .array(
      z.object({
        description: shortTextSchema,
        quantity: z.number().int().positive().default(1),
        unitPrice: positiveMoneySchema,
        taxRateBps: z.number().int().min(0).max(10_000).default(0),
      }),
    )
    .min(1)
    .max(100),
  dueOn: isoDateSchema,
  notes: mediumTextSchema.optional(),
});
/** Create-invoice request. */
export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;

/** One employee's line in a payroll run. */
export const payrollLineSchema = z.object({
  employeeName: shortTextSchema,
  accountNumber: z.string(),
  sortCode: z.string(),
  grossPay: moneySchema,
  deductions: moneySchema,
  netPay: moneySchema,
  status: z.enum(['PENDING', 'PAID', 'FAILED']),
  failureReason: shortTextSchema.nullable(),
});
/** A payroll line. */
export type PayrollLine = z.infer<typeof payrollLineSchema>;

/** A payroll run — a bulk transfer with employment semantics attached. */
export const payrollRunSchema = z.object({
  id: z.string(),
  period: z.string(),
  status: z.enum(['DRAFT', 'AWAITING_APPROVAL', 'PROCESSING', 'COMPLETED', 'FAILED']),
  sourceAccountId: entityId('acc'),
  lines: z.array(payrollLineSchema),
  totalGross: moneySchema,
  totalNet: moneySchema,
  employeeCount: z.number().int(),
  payOn: isoDateSchema,
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
/** A payroll run. */
export type PayrollRun = z.infer<typeof payrollRunSchema>;

/** Body of a payroll submission. */
export const createPayrollRunRequestSchema = z.object({
  period: shortTextSchema,
  sourceAccountId: entityId('acc'),
  payOn: isoDateSchema,
  lines: z
    .array(
      z.object({
        employeeName: shortTextSchema,
        accountNumber: z.string().regex(/^\d{10}$/),
        sortCode: z.string().regex(/^\d{6}$/),
        grossPay: positiveMoneySchema,
        deductions: positiveMoneySchema.optional(),
      }),
    )
    .min(1)
    .max(500),
});
/** Create-payroll-run request. */
export type CreatePayrollRunRequest = z.infer<typeof createPayrollRunRequestSchema>;
