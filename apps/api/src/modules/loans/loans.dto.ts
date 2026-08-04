/**
 * Request shapes the lending module accepts that the frozen contract does not define.
 *
 * The contract fixes the calculator, the application and the repayment; it does not
 * describe how a customer states their income for an eligibility check, nor how an
 * underwriter records a decision. Those schemas live here, written in the same style, so
 * that when the contract grows they can be lifted into it unchanged.
 *
 * `docs/CONTRACT_CHANGES.md` carries the proposal to promote them.
 */

import { z } from 'zod';

import {
  createLoanApplicationRequestSchema,
  entityId,
  isoDateSchema,
  LoanStatus,
  mediumTextSchema,
  positiveMoneySchema,
  shortTextSchema,
} from '@reliance/contracts';

import { DpdBucket } from './loan.types.js';

/** Employment history is capped at a working lifetime; anything longer is a typo. */
const MAX_EMPLOYMENT_MONTHS = 720;

/** Longest term the contract accepts, mirrored here so the DTOs cannot outrun it. */
const MAX_TERM_MONTHS = 480;

/** Longest arrangement collections will agree. Beyond five years it is a restructure. */
const MAX_PLAN_INSTALMENTS = 60;

/**
 * What a customer tells us for an indicative decision.
 *
 * Income and commitments are declared rather than derived. An indicative check happens
 * before any document is supplied, so the honest thing is to quote on what the customer
 * states and verify it at application — which is exactly what the offer's expiry is for.
 */
export const loanEligibilityRequestSchema = z.object({
  productCode: shortTextSchema,
  amount: positiveMoneySchema,
  termMonths: z.number().int().min(1).max(MAX_TERM_MONTHS),
  /** Net monthly income, in the product's currency. */
  monthlyIncome: positiveMoneySchema,
  /** Everything other lenders already take each month. Zero is a valid answer. */
  monthlyDebtPayments: positiveMoneySchema,
  employmentMonths: z.number().int().min(0).max(MAX_EMPLOYMENT_MONTHS),
});
export type LoanEligibilityRequest = z.infer<typeof loanEligibilityRequestSchema>;

/**
 * Creating an application: the contract's request plus the affordability declaration.
 *
 * A strict superset of `createLoanApplicationRequestSchema`, so any client written against
 * the contract still validates. The three extra fields are what the affordability
 * assessment needs and the contract does not yet carry; `docs/CONTRACT_CHANGES.md` carries
 * the proposal to add them, at which point this extension disappears.
 */
export const createApplicationRequestSchema = createLoanApplicationRequestSchema.extend({
  monthlyIncome: positiveMoneySchema,
  monthlyDebtPayments: positiveMoneySchema,
  employmentMonths: z.number().int().min(0).max(MAX_EMPLOYMENT_MONTHS),
});
export type CreateApplicationRequest = z.infer<typeof createApplicationRequestSchema>;

/** Documents the applicant has just supplied. */
export const submitDocumentsRequestSchema = z.object({
  documentKinds: z.array(shortTextSchema).min(1),
});
export type SubmitDocumentsRequest = z.infer<typeof submitDocumentsRequestSchema>;

/** An underwriter's decision on a referred application. */
export const loanDecisionRequestSchema = z.object({
  decision: z.enum(['APPROVE', 'DECLINE']),
  /** Required on a decline: the customer is entitled to be told why. */
  reasons: z.array(mediumTextSchema).default([]),
  /** Approve for less than was asked, when that is what is affordable. */
  approvedAmount: positiveMoneySchema.optional(),
});
export type LoanDecisionRequest = z.infer<typeof loanDecisionRequestSchema>;

/** Changing the terms of a live loan by agreement. */
export const restructureLoanRequestSchema = z.object({
  /** New remaining term in months. Extending reduces the instalment and total interest. */
  termMonths: z.number().int().min(1).max(MAX_TERM_MONTHS),
  reason: mediumTextSchema,
});
export type RestructureLoanRequest = z.infer<typeof restructureLoanRequestSchema>;

/** An arrangement to clear arrears in instalments. */
export const paymentPlanRequestSchema = z.object({
  instalmentAmount: positiveMoneySchema,
  instalments: z.number().int().min(1).max(MAX_PLAN_INSTALMENTS),
  startsOn: isoDateSchema,
});
export type PaymentPlanRequest = z.infer<typeof paymentPlanRequestSchema>;

/** Filtering the customer's own loans. */
export const listLoansQuerySchema = z.object({
  status: z.enum(LoanStatus).optional(),
});
export type ListLoansQuery = z.infer<typeof listLoansQuerySchema>;

/** Filtering the collections queue. */
export const arrearsQuerySchema = z.object({
  bucket: z.enum(DpdBucket).optional(),
});
export type ArrearsQuery = z.infer<typeof arrearsQuerySchema>;

/** Writing a loan off. Recorded against a named reason, never as a bare status change. */
export const writeOffRequestSchema = z.object({
  reason: mediumTextSchema,
});
export type WriteOffRequest = z.infer<typeof writeOffRequestSchema>;

/** Drawing down an accepted offer into a nominated account. */
export const disburseRequestSchema = z.object({
  disbursementAccountId: entityId('acc').optional(),
});
export type DisburseRequest = z.infer<typeof disburseRequestSchema>;
