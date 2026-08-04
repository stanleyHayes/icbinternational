/**
 * The scorecard: a customer profile in, a number between 300 and 850 out.
 *
 * Deterministic and additive, deliberately. A score drawn from a random number would make
 * every test of the decision engine a coin toss and would make it impossible to tell a
 * customer why they were declined; an additive band model can be read off, explained in a
 * decline letter, and reproduced exactly from the same profile a year later.
 *
 * Each factor is a table of thresholds and points. Adding a factor means adding a table,
 * not editing a branch, which is what keeps the function short and the model auditable.
 */

import { minorUnitScale, type Money } from '@reliance/money';

import {
  BASE_CREDIT_SCORE,
  BPS_SCALE,
  MAX_CREDIT_SCORE,
  MIN_CREDIT_SCORE,
} from './loan.constants.js';

/** Everything the scorecard is allowed to look at. */
export interface CreditProfile {
  /** Verified net income per month. */
  readonly monthlyIncome: Money;
  /** Committed repayments to every other lender, per month, same currency as income. */
  readonly monthlyDebtPayments: Money;
  readonly employmentMonths: number;
  /** How long the customer has banked with Reliance. Tenure is predictive. */
  readonly monthsWithBank: number;
  readonly missedPaymentsLast24Months: number;
  readonly openLoanCount: number;
  /** 0–3. Identity assurance is not creditworthiness, but it bounds what we will lend. */
  readonly kycTier: number;
  readonly hasDefaultHistory: boolean;
}

/** A band: meet `atLeast` and score `points`. Tables are ordered strongest first. */
interface Band {
  readonly atLeast: number;
  readonly points: number;
}

/** A step: exactly this many occurrences scores `points`. Tables are ordered ascending. */
interface Step {
  readonly count: number;
  readonly points: number;
}

const INCOME_BANDS: readonly Band[] = [
  { atLeast: 8000, points: 60 },
  { atLeast: 5000, points: 48 },
  { atLeast: 3000, points: 36 },
  { atLeast: 2000, points: 24 },
  { atLeast: 1200, points: 12 },
];

const EMPLOYMENT_BANDS: readonly Band[] = [
  { atLeast: 60, points: 40 },
  { atLeast: 36, points: 30 },
  { atLeast: 24, points: 20 },
  { atLeast: 12, points: 10 },
  { atLeast: 6, points: 4 },
];

const TENURE_BANDS: readonly Band[] = [
  { atLeast: 60, points: 40 },
  { atLeast: 36, points: 30 },
  { atLeast: 24, points: 20 },
  { atLeast: 12, points: 12 },
  { atLeast: 6, points: 6 },
];

/** Read the other way round: a *lower* ratio is better, so these are penalties avoided. */
const DEBT_TO_INCOME_BANDS: readonly Band[] = [
  { atLeast: 6001, points: -60 },
  { atLeast: 4501, points: 0 },
  { atLeast: 3501, points: 20 },
  { atLeast: 2501, points: 45 },
  { atLeast: 1501, points: 70 },
  { atLeast: 0, points: 90 },
];

/**
 * Points by count of missed payments; anything beyond the table takes the last row.
 *
 * A table of rows rather than a bare list of numbers so each value is named at the point
 * it is defined — `{ count: 3, points: -70 }` says what -70 is for, and a positional array
 * does not.
 */
const MISSED_PAYMENT_POINTS: readonly Step[] = [
  { count: 0, points: 60 },
  { count: 1, points: 20 },
  { count: 2, points: -20 },
  { count: 3, points: -70 },
  { count: 4, points: -150 },
];

/** Points by count of loans already open. */
const OPEN_LOAN_POINTS: readonly Step[] = [
  { count: 0, points: 20 },
  { count: 1, points: 10 },
  { count: 2, points: 0 },
  { count: 3, points: -25 },
];

/** Points added per identity tier. Assurance is not creditworthiness, but it correlates. */
const POINTS_PER_KYC_TIER = 10;

/** What a recorded default costs. Large enough that nothing else in the model outweighs it. */
const DEFAULT_HISTORY_PENALTY = -120;

/** Multiple of 100% used to express "worse than any real ratio". */
const UNMEASURABLE_RATIO_MULTIPLE = 10;

/** What a customer with no income scores on affordability: the worst the table allows. */
const UNMEASURABLE_DEBT_TO_INCOME_BPS = Number(BPS_SCALE) * UNMEASURABLE_RATIO_MULTIPLE;

/**
 * Debt-to-income in basis points: existing commitments over income.
 *
 * A customer with no recorded income is not treated as having a ratio of zero — that would
 * make an unemployed applicant look like the safest borrower on the book. They are given
 * the worst measurable ratio, which routes them to an underwriter rather than to an
 * automatic approval.
 */
export function debtToIncomeBps(profile: CreditProfile): number {
  const income = profile.monthlyIncome.amount;
  if (income <= 0n) return UNMEASURABLE_DEBT_TO_INCOME_BPS;

  return Number((profile.monthlyDebtPayments.amount * BPS_SCALE) / income);
}

/**
 * The score for a profile. Same profile, same score, always.
 *
 * @returns An integer in [300, 850], the range the contract's `creditScore` field permits.
 */
export function creditScoreFor(profile: CreditProfile): number {
  const raw =
    BASE_CREDIT_SCORE +
    bandPoints(INCOME_BANDS, majorUnits(profile.monthlyIncome)) +
    bandPoints(EMPLOYMENT_BANDS, profile.employmentMonths) +
    bandPoints(TENURE_BANDS, profile.monthsWithBank) +
    bandPoints(DEBT_TO_INCOME_BANDS, debtToIncomeBps(profile)) +
    stepPoints(MISSED_PAYMENT_POINTS, profile.missedPaymentsLast24Months) +
    stepPoints(OPEN_LOAN_POINTS, profile.openLoanCount) +
    profile.kycTier * POINTS_PER_KYC_TIER +
    (profile.hasDefaultHistory ? DEFAULT_HISTORY_PENALTY : 0);

  return clamp(raw);
}

/**
 * Whole major units of an amount, as a `number`.
 *
 * The division is integer `bigint` arithmetic and the result is a monthly income, which is
 * far inside `Number.MAX_SAFE_INTEGER` — no float ever touches the amount itself, and the
 * value is used only to pick a band, never to compute money.
 */
function majorUnits(amount: Money): number {
  return Number(amount.amount / minorUnitScale(amount.currency));
}

function bandPoints(bands: readonly Band[], value: number): number {
  return bands.find((band) => value >= band.atLeast)?.points ?? 0;
}

/** Looks a count up in a step table, saturating at the last row. */
function stepPoints(table: readonly Step[], count: number): number {
  const index = Math.min(Math.max(count, 0), table.length - 1);
  return table[index]?.points ?? 0;
}

function clamp(score: number): number {
  return Math.min(Math.max(Math.round(score), MIN_CREDIT_SCORE), MAX_CREDIT_SCORE);
}
