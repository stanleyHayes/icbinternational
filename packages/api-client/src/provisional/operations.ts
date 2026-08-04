/**
 * Provisional shapes for admin reporting, platform administration and system routes.
 *
 * Gap-fillers for routes the frozen contract declares but does not describe. Bare item
 * schemas, like the contract's own modules. See `./README.md`.
 */

import { z } from 'zod';

import {
  entityId,
  isoDateSchema,
  isoDateTimeSchema,
  mediumTextSchema,
  moneySchema,
  shortTextSchema,
} from '@reliance/contracts';

// --- Finance reports ------------------------------------------------------

/** One row of a financial report. Reports differ in their rows, not their envelope. */
export const reportLineSchema = z.object({
  code: z.string(),
  label: shortTextSchema,
  amount: moneySchema,
  /** Nesting depth, so a renderer can indent without knowing the chart of accounts. */
  depth: z.number().int().min(0).max(5),
  isSubtotal: z.boolean(),
  comparativeAmount: moneySchema.nullable(),
});
/** A financial report line. */
export type ReportLine = z.infer<typeof reportLineSchema>;

/**
 * The shared shape of the P&L, balance sheet and general ledger.
 *
 * One schema for all three because they differ only in which lines they contain. Giving
 * each its own type would force the console to write three renderers for one table.
 */
export const financialReportSchema = z.object({
  report: z.enum(['GENERAL_LEDGER', 'PROFIT_AND_LOSS', 'BALANCE_SHEET']),
  currency: z.string().length(3),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  lines: z.array(reportLineSchema),
  total: moneySchema,
  /** False when the underlying ledger does not foot. Stop the bank if you see it. */
  balanced: z.boolean(),
  generatedAt: isoDateTimeSchema,
});
/** A financial report. */
export type FinancialReport = z.infer<typeof financialReportSchema>;

/** An item that appears on one side of a reconciliation only. */
export const reconciliationExceptionSchema = z.object({
  side: z.enum(['INTERNAL', 'EXTERNAL']),
  reference: z.string(),
  amount: moneySchema,
  at: isoDateTimeSchema,
  note: shortTextSchema.nullable(),
});
/** A reconciliation exception. */
export type ReconciliationException = z.infer<typeof reconciliationExceptionSchema>;

/** Reconciliation between the internal ledger and an external rail statement. */
export const reconciliationReportSchema = z.object({
  rail: shortTextSchema,
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  internalTotal: moneySchema,
  externalTotal: moneySchema,
  difference: moneySchema,
  matchedCount: z.number().int(),
  /** Each exception is a real operational task for a named person. */
  unmatched: z.array(reconciliationExceptionSchema),
  reconciled: z.boolean(),
  generatedAt: isoDateTimeSchema,
});
/** A reconciliation report. */
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;

// --- Compliance & risk ----------------------------------------------------

/** A sanctions or PEP screening hit awaiting adjudication. */
export const screeningHitSchema = z.object({
  id: z.string(),
  userId: entityId('usr'),
  customerName: shortTextSchema,
  listName: shortTextSchema,
  matchedName: shortTextSchema,
  /** Fuzzy match confidence, 0–100. Below the threshold is auto-discounted. */
  matchScore: z.number().int().min(0).max(100),
  matchType: z.enum(['SANCTIONS', 'PEP', 'ADVERSE_MEDIA', 'INTERNAL_WATCHLIST']),
  status: z.enum(['OPEN', 'TRUE_MATCH', 'FALSE_POSITIVE', 'ESCALATED']),
  assignedToId: entityId('adm').nullable(),
  detail: mediumTextSchema,
  screenedAt: isoDateTimeSchema,
  decidedAt: isoDateTimeSchema.nullable(),
});
/** A screening hit. */
export type ScreeningHit = z.infer<typeof screeningHitSchema>;

/** A fraud rule. Sibling of the contract's `amlRuleSchema`, on the fraud side. */
export const fraudRuleSchema = z.object({
  id: z.string(),
  name: shortTextSchema,
  description: mediumTextSchema,
  enabled: z.boolean(),
  /** What the rule does when it fires: score, challenge, or hard block. */
  action: z.enum(['SCORE_ONLY', 'CHALLENGE', 'BLOCK', 'REVIEW']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  triggersLast30Days: z.number().int(),
  falsePositiveRateBps: z.number().int(),
  updatedAt: isoDateTimeSchema,
});
/** A fraud rule. */
export type FraudRule = z.infer<typeof fraudRuleSchema>;

/** What a rule would have caught had it been live over a historical window. */
export const ruleBacktestSchema = z.object({
  ruleId: z.string(),
  windowDays: z.number().int().positive(),
  transactionsEvaluated: z.number().int(),
  wouldHaveAlerted: z.number().int(),
  /** Overlap with alerts that actually fired — the false-positive proxy. */
  matchedExistingAlerts: z.number().int(),
  estimatedFalsePositiveRateBps: z.number().int(),
  sampleTransactionIds: z.array(entityId('txn')),
  ranAt: isoDateTimeSchema,
});
/** A rule backtest result. */
export type RuleBacktest = z.infer<typeof ruleBacktestSchema>;

/** Short-lived impersonation grant, always audited and always time-boxed. */
export const impersonationGrantSchema = z.object({
  token: z.string(),
  userId: entityId('usr'),
  /** Why. Recorded verbatim in the audit chain; there is no impersonation without it. */
  justification: mediumTextSchema,
  readOnly: z.boolean(),
  expiresAt: isoDateTimeSchema,
  issuedAt: isoDateTimeSchema,
});
/** An impersonation grant. */
export type ImpersonationGrant = z.infer<typeof impersonationGrantSchema>;

// --- Platform administration ---------------------------------------------

/** A named bundle of permissions. Guards check permissions, never role names. */
export const adminRoleDefinitionSchema = z.object({
  role: z.string(),
  label: shortTextSchema,
  description: mediumTextSchema,
  permissions: z.array(z.string()),
  memberCount: z.number().int(),
  /** Built-in roles cannot be deleted, only cloned. */
  system: z.boolean(),
});
/** An admin role definition. */
export type AdminRoleDefinition = z.infer<typeof adminRoleDefinitionSchema>;

/** A messaging template used by the comms engine. */
export const commsTemplateSchema = z.object({
  id: z.string(),
  key: z.string(),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'IN_APP']),
  name: shortTextSchema,
  subject: shortTextSchema.nullable(),
  body: z.string(),
  /** Placeholders the body expects, so an editor can validate before publishing. */
  variables: z.array(shortTextSchema),
  locale: z.string(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  updatedAt: isoDateTimeSchema,
});
/** A comms template. */
export type CommsTemplate = z.infer<typeof commsTemplateSchema>;

/** A campaign send against a customer segment. */
export const commsCampaignSchema = z.object({
  id: z.string(),
  name: shortTextSchema,
  templateId: z.string(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED']),
  segment: shortTextSchema,
  audienceSize: z.number().int(),
  sentCount: z.number().int(),
  openCount: z.number().int(),
  clickCount: z.number().int(),
  scheduledFor: isoDateTimeSchema.nullable(),
  sentAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
/** A comms campaign. */
export type CommsCampaign = z.infer<typeof commsCampaignSchema>;

/** A background job execution, as the ops console lists it. */
export const jobRunSchema = z.object({
  id: z.string(),
  name: shortTextSchema,
  queue: shortTextSchema,
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'DEAD']),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  durationMs: z.number().int().nullable(),
  failureReason: mediumTextSchema.nullable(),
  /** Correlates the run with the trace that scheduled it. */
  traceId: z.string().nullable(),
  scheduledAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
});
/** A background job run. */
export type JobRun = z.infer<typeof jobRunSchema>;

// --- Public & system ------------------------------------------------------

/** Headline savings and lending rates for the marketing site. */
export const publicRatesSchema = z.object({
  savings: z.array(
    z.object({
      productCode: shortTextSchema,
      productName: shortTextSchema,
      annualRateBps: z.number().int(),
      minBalance: moneySchema,
    }),
  ),
  lending: z.array(
    z.object({
      productCode: shortTextSchema,
      productName: shortTextSchema,
      representativeAprBps: z.number().int(),
      maxAmount: moneySchema,
    }),
  ),
  effectiveFrom: isoDateSchema,
  asOf: isoDateTimeSchema,
});
/** Public headline rates. */
export type PublicRates = z.infer<typeof publicRatesSchema>;

/** Body of a savings-calculator call. */
export const savingsCalculationRequestSchema = z.object({
  initialDeposit: moneySchema,
  monthlyContribution: moneySchema,
  annualRateBps: z.number().int().min(0).max(10_000),
  months: z.number().int().min(1).max(600),
});
/** Savings-calculator request. */
export type SavingsCalculationRequest = z.infer<typeof savingsCalculationRequestSchema>;

/** Savings projection, computed server-side so no float reaches the client. */
export const savingsProjectionSchema = z.object({
  initialDeposit: moneySchema,
  monthlyContribution: moneySchema,
  annualRateBps: z.number().int(),
  months: z.number().int().positive(),
  totalContributions: moneySchema,
  totalInterest: moneySchema,
  finalBalance: moneySchema,
  milestones: z.array(
    z.object({ month: z.number().int(), balance: moneySchema, interest: moneySchema }),
  ),
});
/** A savings projection. */
export type SavingsProjection = z.infer<typeof savingsProjectionSchema>;

/**
 * Liveness and readiness payload.
 *
 * Shaped like Terminus's output rather than the contract's `{ data }` envelope, because
 * this endpoint is consumed by Kubernetes probes and uptime monitors that expect the
 * conventional shape — not by any of the three front ends.
 */
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  info: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  error: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  details: z.record(z.string(), z.record(z.string(), z.unknown())),
});
/** Health check payload. */
export type Health = z.infer<typeof healthSchema>;
