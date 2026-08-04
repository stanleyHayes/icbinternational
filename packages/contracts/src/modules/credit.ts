/**
 * Lending and saving products: loans, overdrafts, term deposits and savings goals.
 *
 * Rates are held as integer basis points and schedules are generated in minor units, so
 * an amortisation table always sums exactly to the principal plus interest — the final
 * instalment absorbs the rounding rather than the customer discovering a stray penny.
 */

import { z } from 'zod';

import {
  currencyCodeSchema,
  entityId,
  isoDateSchema,
  isoDateTimeSchema,
  mediumTextSchema,
  moneySchema,
  positiveMoneySchema,
  shortTextSchema,
} from '../common/primitives.js';

// --- Loans ----------------------------------------------------------------

export const LoanKind = {
  PERSONAL: 'PERSONAL',
  AUTO: 'AUTO',
  MORTGAGE: 'MORTGAGE',
  BUSINESS: 'BUSINESS',
  OVERDRAFT: 'OVERDRAFT',
} as const;
export type LoanKind = (typeof LoanKind)[keyof typeof LoanKind];

export const LoanApplicationStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  REFERRED: 'REFERRED',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  OFFER_MADE: 'OFFER_MADE',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
  DISBURSED: 'DISBURSED',
} as const;
export type LoanApplicationStatus =
  (typeof LoanApplicationStatus)[keyof typeof LoanApplicationStatus];

export const LoanStatus = {
  ACTIVE: 'ACTIVE',
  IN_ARREARS: 'IN_ARREARS',
  SETTLED: 'SETTLED',
  WRITTEN_OFF: 'WRITTEN_OFF',
  RESTRUCTURED: 'RESTRUCTURED',
} as const;
export type LoanStatus = (typeof LoanStatus)[keyof typeof LoanStatus];

export const loanProductSchema = z.object({
  code: shortTextSchema,
  name: shortTextSchema,
  kind: z.enum(LoanKind),
  currency: currencyCodeSchema,
  minAmount: positiveMoneySchema,
  maxAmount: positiveMoneySchema,
  minTermMonths: z.number().int().positive(),
  maxTermMonths: z.number().int().positive(),
  /** Representative annual rate in basis points. 1499 = 14.99% APR. */
  representativeAprBps: z.number().int(),
  minAprBps: z.number().int(),
  maxAprBps: z.number().int(),
  arrangementFee: moneySchema,
  earlyRepaymentFeeBps: z.number().int(),
  minKycTier: z.number().int().min(0).max(3),
  description: mediumTextSchema,
});
export type LoanProduct = z.infer<typeof loanProductSchema>;

export const loanCalculationRequestSchema = z.object({
  productCode: shortTextSchema,
  amount: positiveMoneySchema,
  termMonths: z.number().int().min(1).max(480),
});
export type LoanCalculationRequest = z.infer<typeof loanCalculationRequestSchema>;

export const amortisationRowSchema = z.object({
  instalment: z.number().int().positive(),
  dueDate: isoDateSchema,
  openingBalance: moneySchema,
  payment: moneySchema,
  principal: moneySchema,
  interest: moneySchema,
  fees: moneySchema,
  closingBalance: moneySchema,
  status: z.enum(['SCHEDULED', 'PAID', 'PARTIAL', 'OVERDUE', 'WAIVED']),
  paidAt: isoDateTimeSchema.nullable(),
});
export type AmortisationRow = z.infer<typeof amortisationRowSchema>;

export const loanQuoteSchema = z.object({
  productCode: shortTextSchema,
  amount: moneySchema,
  termMonths: z.number().int(),
  aprBps: z.number().int(),
  monthlyPayment: moneySchema,
  totalRepayable: moneySchema,
  totalInterest: moneySchema,
  arrangementFee: moneySchema,
  firstPaymentDate: isoDateSchema,
  schedule: z.array(amortisationRowSchema),
});
export type LoanQuote = z.infer<typeof loanQuoteSchema>;

export const loanEligibilitySchema = z.object({
  eligible: z.boolean(),
  maxAmount: moneySchema,
  indicativeAprBps: z.number().int().nullable(),
  /** Deterministic simulated score, 300–850. */
  creditScore: z.number().int().min(300).max(850),
  /** Debt-to-income in basis points. */
  debtToIncomeBps: z.number().int(),
  reasons: z.array(shortTextSchema),
});
export type LoanEligibility = z.infer<typeof loanEligibilitySchema>;

export const loanApplicationSchema = z.object({
  id: z.string(),
  productCode: shortTextSchema,
  status: z.enum(LoanApplicationStatus),
  requestedAmount: positiveMoneySchema,
  termMonths: z.number().int(),
  purpose: shortTextSchema,
  offer: loanQuoteSchema.nullable(),
  offerExpiresAt: isoDateTimeSchema.nullable(),
  declineReasons: z.array(shortTextSchema),
  requiredDocumentKinds: z.array(shortTextSchema),
  submittedAt: isoDateTimeSchema.nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type LoanApplication = z.infer<typeof loanApplicationSchema>;

export const createLoanApplicationRequestSchema = z.object({
  productCode: shortTextSchema,
  amount: positiveMoneySchema,
  termMonths: z.number().int().min(1).max(480),
  purpose: shortTextSchema,
  disbursementAccountId: entityId('acc'),
});
export type CreateLoanApplicationRequest = z.infer<typeof createLoanApplicationRequestSchema>;

export const loanSchema = z.object({
  id: entityId('loa'),
  applicationId: z.string(),
  productCode: shortTextSchema,
  productName: shortTextSchema,
  kind: z.enum(LoanKind),
  status: z.enum(LoanStatus),
  principal: moneySchema,
  outstandingBalance: moneySchema,
  aprBps: z.number().int(),
  termMonths: z.number().int(),
  monthlyPayment: moneySchema,
  nextPaymentDate: isoDateSchema.nullable(),
  nextPaymentAmount: moneySchema.nullable(),
  instalmentsPaid: z.number().int(),
  instalmentsRemaining: z.number().int(),
  arrearsAmount: moneySchema,
  daysPastDue: z.number().int(),
  disbursedAt: isoDateTimeSchema,
  maturesOn: isoDateSchema,
  settledAt: isoDateTimeSchema.nullable(),
});
export type Loan = z.infer<typeof loanSchema>;

export const payoffQuoteSchema = z.object({
  loanId: entityId('loa'),
  outstandingPrincipal: moneySchema,
  accruedInterest: moneySchema,
  earlyRepaymentFee: moneySchema,
  interestRebate: moneySchema,
  totalPayable: moneySchema,
  validUntil: isoDateTimeSchema,
});
export type PayoffQuote = z.infer<typeof payoffQuoteSchema>;

export const repayLoanRequestSchema = z.object({
  fromAccountId: entityId('acc'),
  amount: positiveMoneySchema,
  /** Overpayments either shorten the term or reduce the instalment — customer's choice. */
  overpaymentEffect: z.enum(['REDUCE_TERM', 'REDUCE_INSTALMENT']).default('REDUCE_TERM'),
});
export type RepayLoanRequest = z.infer<typeof repayLoanRequestSchema>;

// --- Term deposits --------------------------------------------------------

export const DepositStatus = {
  ACTIVE: 'ACTIVE',
  MATURED: 'MATURED',
  ROLLED_OVER: 'ROLLED_OVER',
  BROKEN: 'BROKEN',
} as const;
export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus];

export const depositRateSchema = z.object({
  termMonths: z.number().int().positive(),
  annualRateBps: z.number().int(),
  minAmount: positiveMoneySchema,
  currency: currencyCodeSchema,
});
export type DepositRate = z.infer<typeof depositRateSchema>;

export const depositSchema = z.object({
  id: entityId('dep'),
  status: z.enum(DepositStatus),
  principal: moneySchema,
  annualRateBps: z.number().int(),
  termMonths: z.number().int(),
  interestAccrued: moneySchema,
  projectedInterest: moneySchema,
  maturityValue: moneySchema,
  autoRollover: z.boolean(),
  sourceAccountId: entityId('acc'),
  placedAt: isoDateTimeSchema,
  maturesOn: isoDateSchema,
  brokenAt: isoDateTimeSchema.nullable(),
});
export type Deposit = z.infer<typeof depositSchema>;

export const createDepositRequestSchema = z.object({
  sourceAccountId: entityId('acc'),
  amount: positiveMoneySchema,
  termMonths: z.number().int().positive(),
  autoRollover: z.boolean().default(false),
});
export type CreateDepositRequest = z.infer<typeof createDepositRequestSchema>;

export const breakDepositQuoteSchema = z.object({
  principal: moneySchema,
  interestEarned: moneySchema,
  penaltyRateBps: z.number().int(),
  penaltyAmount: moneySchema,
  netProceeds: moneySchema,
});
export type BreakDepositQuote = z.infer<typeof breakDepositQuoteSchema>;

// --- Savings goals --------------------------------------------------------

export const goalSchema = z.object({
  id: entityId('gol'),
  name: shortTextSchema,
  emoji: z.string().max(8).nullable(),
  targetAmount: positiveMoneySchema,
  currentAmount: moneySchema,
  progressBps: z.number().int().min(0).max(10_000),
  targetDate: isoDateSchema.nullable(),
  /** Contribution needed per month to hit the target date. */
  suggestedMonthlyContribution: moneySchema.nullable(),
  onTrack: z.boolean(),
  linkedAccountId: entityId('acc'),
  roundUpsEnabled: z.boolean(),
  autoSave: z
    .object({
      amount: positiveMoneySchema,
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
      nextRunAt: isoDateTimeSchema,
    })
    .nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Goal = z.infer<typeof goalSchema>;

export const createGoalRequestSchema = z.object({
  name: shortTextSchema,
  emoji: z.string().max(8).optional(),
  targetAmount: positiveMoneySchema,
  targetDate: isoDateSchema.optional(),
  linkedAccountId: entityId('acc'),
  roundUpsEnabled: z.boolean().default(false),
});
export type CreateGoalRequest = z.infer<typeof createGoalRequestSchema>;
