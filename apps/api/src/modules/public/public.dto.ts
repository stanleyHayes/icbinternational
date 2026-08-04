/**
 * Wire shapes for the public surface.
 *
 * The frozen contract carries the reads — `CmsPage`, `Article`, `Faq`, `BankLocation`,
 * `LeadRequest`. What it does not carry is the two calculators or the rate and fee tables,
 * so those are declared here from contract primitives.
 *
 * Every monetary figure crosses this boundary as a decimal string of **minor units**, the
 * same as everywhere else in the API. JSON numbers are doubles, and a projection that
 * loses precision on the wire has lost the argument before it is rendered.
 */

import { z } from 'zod';

import { isoDateSchema, moneySchema, shortTextSchema } from '@reliance/contracts';

/** A rate cannot exceed 10,000% — a bound, not a product decision. */
const MAX_RATE_BASIS_POINTS = 1_000_000;
/** The published rate ceiling the calculators accept as an override: 100%. */
const MAX_QUOTED_BASIS_POINTS = 10_000;

/** Loan bounds, in minor units: £500 to £25,000. */
const MIN_LOAN_MINOR_UNITS = 50_000;
const MAX_LOAN_MINOR_UNITS = 2_500_000;
const MIN_LOAN_TERM_MONTHS = 12;
const MAX_LOAN_TERM_MONTHS = 84;

/** Savings bounds, in minor units: up to £1,000,000 opening and £100,000 a month. */
const MAX_OPENING_MINOR_UNITS = 100_000_000;
const MAX_MONTHLY_MINOR_UNITS = 10_000_000;
const MAX_PROJECTION_YEARS = 30;

/** A rate expressed as basis points — hundredths of a percent — as an integer. */
const basisPointsSchema = z.number().int().min(0).max(MAX_RATE_BASIS_POINTS);

export const rateRowSchema = z.object({
  product: shortTextSchema,
  rateBasisPoints: basisPointsSchema,
  /** How the rate is presented, including whether it is fixed or variable. */
  rateLabel: shortTextSchema,
  detail: z.record(z.string(), z.string()).default({}),
});
export type RateRow = z.infer<typeof rateRowSchema>;

export const rateTableSchema = z.object({
  slug: z.string(),
  title: shortTextSchema,
  effectiveFrom: isoDateSchema,
  note: z.string(),
  rows: z.array(rateRowSchema),
});
export type RateTable = z.infer<typeof rateTableSchema>;

export const feeRowSchema = z.object({
  item: shortTextSchema,
  /** Minor units as a decimal string. `"0"` means free, and says so plainly. */
  feeMinorUnits: z.string().regex(/^\d+$/),
  detail: z.string(),
});
export type FeeRow = z.infer<typeof feeRowSchema>;

export const feeScheduleSchema = z.object({
  slug: z.string(),
  title: shortTextSchema,
  effectiveFrom: isoDateSchema,
  note: z.string(),
  groups: z.array(z.object({ heading: shortTextSchema, rows: z.array(feeRowSchema) })),
});
export type FeeSchedule = z.infer<typeof feeScheduleSchema>;

// --- Calculators ----------------------------------------------------------

export const loanCalculatorQuerySchema = z.object({
  /** Minor units. A £8,000 loan is `800000`. */
  amountMinorUnits: z.coerce.number().int().min(MIN_LOAN_MINOR_UNITS).max(MAX_LOAN_MINOR_UNITS),
  termMonths: z.coerce.number().int().min(MIN_LOAN_TERM_MONTHS).max(MAX_LOAN_TERM_MONTHS),
  /** Optional override; defaults to the published representative rate for the amount. */
  rateBasisPoints: z.coerce.number().int().min(0).max(MAX_QUOTED_BASIS_POINTS).optional(),
});
export type LoanCalculatorQuery = z.infer<typeof loanCalculatorQuerySchema>;

export const loanCalculationSchema = z.object({
  monthlyPayment: moneySchema,
  totalRepayable: moneySchema,
  totalInterest: moneySchema,
  rateLabel: shortTextSchema,
  termMonths: z.number().int(),
  /** First twelve instalments. The full schedule is shown once an application is made. */
  firstYear: z.array(
    z.object({
      month: z.number().int(),
      payment: moneySchema,
      interest: moneySchema,
      principal: moneySchema,
      balance: moneySchema,
    }),
  ),
});
export type LoanCalculation = z.infer<typeof loanCalculationSchema>;

export const savingsCalculatorQuerySchema = z.object({
  openingMinorUnits: z.coerce.number().int().min(0).max(MAX_OPENING_MINOR_UNITS),
  monthlyMinorUnits: z.coerce.number().int().min(0).max(MAX_MONTHLY_MINOR_UNITS),
  years: z.coerce.number().int().min(1).max(MAX_PROJECTION_YEARS),
  rateBasisPoints: z.coerce.number().int().min(0).max(MAX_QUOTED_BASIS_POINTS).optional(),
});
export type SavingsCalculatorQuery = z.infer<typeof savingsCalculatorQuerySchema>;

export const savingsCalculationSchema = z.object({
  finalBalance: moneySchema,
  totalDeposited: moneySchema,
  totalInterest: moneySchema,
  rateLabel: shortTextSchema,
  byYear: z.array(
    z.object({ year: z.number().int(), balance: moneySchema, interestEarned: moneySchema }),
  ),
});
export type SavingsCalculation = z.infer<typeof savingsCalculationSchema>;

// --- Submissions ----------------------------------------------------------

export const submissionAcceptedSchema = z.object({ received: z.literal(true) });
export type SubmissionAccepted = z.infer<typeof submissionAcceptedSchema>;
