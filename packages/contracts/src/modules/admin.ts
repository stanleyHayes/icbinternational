/**
 * Operations console contracts: staff identity, RBAC, audit, AML and dual approval.
 *
 * Two rules are encoded here rather than left to convention. Permissions are explicit
 * strings, never derived from a role name at the call site — a role is a bundle, the
 * permission is the check. And a manual posting always needs a second, different admin.
 */

import { z } from 'zod';

import { cursorQuerySchema } from '../common/envelope.js';
import {
  entityId,
  isoDateTimeSchema,
  longTextSchema,
  mediumTextSchema,
  moneySchema,
  positiveMoneySchema,
  shortTextSchema,
} from '../common/primitives.js';

// --- RBAC -----------------------------------------------------------------

export const AdminRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER',
  KYC_ANALYST: 'KYC_ANALYST',
  FRAUD_ANALYST: 'FRAUD_ANALYST',
  OPERATIONS: 'OPERATIONS',
  TREASURY: 'TREASURY',
  UNDERWRITER: 'UNDERWRITER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  CONTENT_EDITOR: 'CONTENT_EDITOR',
  AUDITOR: 'AUDITOR',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

/** `<resource>:<action>`. Guards compare against these strings, never against roles. */
export const Permission = {
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_WRITE: 'customer:write',
  CUSTOMER_FREEZE: 'customer:freeze',
  CUSTOMER_IMPERSONATE: 'customer:impersonate',
  KYC_READ: 'kyc:read',
  KYC_DECIDE: 'kyc:decide',
  TRANSACTION_READ: 'transaction:read',
  TRANSACTION_REVERSE: 'transaction:reverse',
  POSTING_INITIATE: 'posting:initiate',
  POSTING_APPROVE: 'posting:approve',
  HOLD_MANAGE: 'hold:manage',
  AML_READ: 'aml:read',
  AML_DECIDE: 'aml:decide',
  AML_RULE_WRITE: 'aml:rule:write',
  FRAUD_MANAGE: 'fraud:manage',
  DISPUTE_MANAGE: 'dispute:manage',
  CARD_MANAGE: 'card:manage',
  LOAN_DECIDE: 'loan:decide',
  PRODUCT_WRITE: 'product:write',
  CONTENT_WRITE: 'content:write',
  CONTENT_PUBLISH: 'content:publish',
  COMMS_SEND: 'comms:send',
  TICKET_MANAGE: 'ticket:manage',
  REPORT_READ: 'report:read',
  ADMIN_MANAGE: 'admin:manage',
  AUDIT_READ: 'audit:read',
  FLAG_WRITE: 'flag:write',
  JOB_MANAGE: 'job:manage',
  SIMULATION_RUN: 'simulation:run',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const adminUserSchema = z.object({
  id: entityId('adm'),
  email: z.email(),
  fullName: shortTextSchema,
  roles: z.array(z.enum(AdminRole)).min(1),
  permissions: z.array(z.enum(Permission)),
  active: z.boolean(),
  mfaEnrolled: z.boolean(),
  ipAllowlist: z.array(z.string()),
  lastLoginAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

// --- Audit ----------------------------------------------------------------

export const auditEventSchema = z.object({
  id: entityId('aud'),
  sequence: z.number().int(),
  actorType: z.enum(['CUSTOMER', 'ADMIN', 'SYSTEM', 'JOB']),
  actorId: z.string(),
  actorName: shortTextSchema,
  action: shortTextSchema,
  entity: shortTextSchema,
  entityId: z.string(),
  /** Field-level diff. Values are redacted for PII and secrets before storage. */
  changes: z.array(
    z.object({ field: z.string(), before: z.string().nullable(), after: z.string().nullable() }),
  ),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  traceId: z.string(),
  /** Hash chain over the previous event — any edit breaks every link after it. */
  previousHash: z.string(),
  hash: z.string(),
  at: isoDateTimeSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditQuerySchema = cursorQuerySchema.extend({
  actorId: z.string().optional(),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});

export const auditChainVerificationSchema = z.object({
  data: z.object({
    verified: z.boolean(),
    eventsChecked: z.number().int(),
    firstBrokenSequence: z.number().int().nullable(),
    checkedAt: isoDateTimeSchema,
  }),
});

// --- Dual approval --------------------------------------------------------

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const manualPostingRequestSchema = z.object({
  accountId: entityId('acc'),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: positiveMoneySchema,
  /** GL account the opposing leg posts to. */
  contraLedgerCode: z.string().regex(/^\d{4}$/),
  narrative: shortTextSchema,
  justification: longTextSchema,
});
export type ManualPostingRequest = z.infer<typeof manualPostingRequestSchema>;

export const approvalRequestSchema = z.object({
  id: z.string(),
  kind: z.enum(['MANUAL_POSTING', 'REVERSAL', 'LIMIT_OVERRIDE', 'ACCOUNT_CLOSURE', 'WRITE_OFF']),
  status: z.enum(ApprovalStatus),
  initiatedBy: z.object({ id: entityId('adm'), name: shortTextSchema }),
  /** Never the same admin as `initiatedBy`; the API rejects self-approval. */
  decidedBy: z.object({ id: entityId('adm'), name: shortTextSchema }).nullable(),
  payload: z.record(z.string(), z.unknown()),
  amount: moneySchema.nullable(),
  justification: longTextSchema,
  decisionNote: mediumTextSchema.nullable(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  decidedAt: isoDateTimeSchema.nullable(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const decideApprovalRequestSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: mediumTextSchema,
});

// --- AML ------------------------------------------------------------------

export const AmlRuleKind = {
  VELOCITY: 'VELOCITY',
  STRUCTURING: 'STRUCTURING',
  ROUND_AMOUNT: 'ROUND_AMOUNT',
  DORMANT_REACTIVATION: 'DORMANT_REACTIVATION',
  HIGH_RISK_CORRIDOR: 'HIGH_RISK_CORRIDOR',
  THRESHOLD_AGGREGATION: 'THRESHOLD_AGGREGATION',
  RAPID_MOVEMENT: 'RAPID_MOVEMENT',
  SANCTIONS_MATCH: 'SANCTIONS_MATCH',
  PEP_MATCH: 'PEP_MATCH',
} as const;
export type AmlRuleKind = (typeof AmlRuleKind)[keyof typeof AmlRuleKind];

export const AlertSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const AlertStatus = {
  OPEN: 'OPEN',
  TRIAGED: 'TRIAGED',
  ESCALATED: 'ESCALATED',
  CLOSED_FALSE_POSITIVE: 'CLOSED_FALSE_POSITIVE',
  CLOSED_ACTIONED: 'CLOSED_ACTIONED',
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export const amlRuleSchema = z.object({
  id: z.string(),
  kind: z.enum(AmlRuleKind),
  name: shortTextSchema,
  description: mediumTextSchema,
  enabled: z.boolean(),
  severity: z.enum(AlertSeverity),
  /** Rule-specific thresholds, e.g. `{ windowHours: 24, count: 10, amount: "990000" }`. */
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  alertsLast30Days: z.number().int(),
  falsePositiveRateBps: z.number().int(),
  updatedAt: isoDateTimeSchema,
});
export type AmlRule = z.infer<typeof amlRuleSchema>;

export const amlAlertSchema = z.object({
  id: entityId('alt'),
  ruleId: z.string(),
  ruleName: shortTextSchema,
  severity: z.enum(AlertSeverity),
  status: z.enum(AlertStatus),
  userId: entityId('usr'),
  customerName: shortTextSchema,
  /** Risk contribution, 0–100. */
  score: z.number().int().min(0).max(100),
  summary: mediumTextSchema,
  relatedTransactionIds: z.array(entityId('txn')),
  assignedToId: entityId('adm').nullable(),
  caseId: entityId('cse').nullable(),
  raisedAt: isoDateTimeSchema,
  slaDueAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
});
export type AmlAlert = z.infer<typeof amlAlertSchema>;

export const amlCaseSchema = z.object({
  id: entityId('cse'),
  reference: shortTextSchema,
  status: z.enum(['OPEN', 'INVESTIGATING', 'AWAITING_APPROVAL', 'CLOSED', 'REPORTED']),
  userId: entityId('usr'),
  customerName: shortTextSchema,
  alertIds: z.array(entityId('alt')),
  severity: z.enum(AlertSeverity),
  assignedToId: entityId('adm').nullable(),
  notes: z.array(
    z.object({ authorName: shortTextSchema, body: longTextSchema, at: isoDateTimeSchema }),
  ),
  evidenceIds: z.array(entityId('doc')),
  disposition: z.enum(['NO_ACTION', 'MONITOR', 'RESTRICT', 'EXIT', 'REPORTED']).nullable(),
  suspiciousActivityReportFiled: z.boolean(),
  openedAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
});
export type AmlCase = z.infer<typeof amlCaseSchema>;

export const featureFlagSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  description: mediumTextSchema,
  enabled: z.boolean(),
  /** Percentage rollout in basis points, for gradual enablement. */
  rolloutBps: z.number().int().min(0).max(10_000),
  segments: z.array(shortTextSchema),
  updatedAt: isoDateTimeSchema,
});
export type FeatureFlag = z.infer<typeof featureFlagSchema>;
