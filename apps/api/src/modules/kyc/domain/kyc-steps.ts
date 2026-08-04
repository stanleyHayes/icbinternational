/**
 * The wizard's step machine, as pure functions.
 *
 * The server — not the client — owns the order in which onboarding unfolds: every step
 * submission returns the whole case with `nextStep` recomputed, so a resumed wizard
 * lands where the bank says it is, never where the browser last remembers being.
 */

import { KycStatus, type KycStatus as KycStatusType, type KycStep } from '@reliance/contracts';

/** Every step, in the only order the wizard may visit them. */
export const KYC_STEP_ORDER: readonly KycStep[] = Object.freeze([
  'IDENTITY',
  'ADDRESS',
  'EMPLOYMENT',
  'SOURCE_OF_FUNDS',
  'DOCUMENTS',
  'LIVENESS',
  'REVIEW',
]);

/**
 * The steps a customer actually submits an answer for.
 *
 * `REVIEW` has no answer of its own — it is the summary the customer confirms by
 * submitting the case — so it is derived rather than collected.
 */
export const WORKFLOW_STEPS: readonly KycStep[] = Object.freeze(
  KYC_STEP_ORDER.filter((step) => step !== 'REVIEW'),
);

/** Statuses in which the customer may still answer steps. */
export const EDITABLE_STATUSES: readonly KycStatusType[] = Object.freeze([
  KycStatus.IN_PROGRESS,
  KycStatus.MORE_INFO_REQUIRED,
]);

/** Position of the month-day suffix inside an ISO calendar date (`YYYY-MM-DD`). */
const MONTH_DAY_START = 5;

/** True while a case accepts step submissions and document changes. */
export function isEditable(status: KycStatusType): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/**
 * The step the wizard should show next.
 *
 * The first workflow step without an answer, or `REVIEW` once every answer is in.
 * `null` is reserved for cases that have left the wizard — submitted, decided.
 */
export function nextStepFor(completedSteps: readonly KycStep[]): KycStep {
  const outstanding = WORKFLOW_STEPS.find((step) => !completedSteps.includes(step));
  return outstanding ?? 'REVIEW';
}

/** True when every answer the bank needs has been collected and the case may be submitted. */
export function readyForSubmission(completedSteps: readonly KycStep[]): boolean {
  return WORKFLOW_STEPS.every((step) => completedSteps.includes(step));
}

/** Adds a step to the completed set. Idempotent by identity: one answer, one entry. */
export function withStepCompleted(completedSteps: readonly KycStep[], step: KycStep): KycStep[] {
  return completedSteps.includes(step) ? [...completedSteps] : [...completedSteps, step];
}

/**
 * Whole years between two ISO calendar dates (`YYYY-MM-DD`).
 *
 * String-comparison based rather than millisecond arithmetic: ISO calendar dates sort
 * lexicographically, a birthday that falls today counts, and no timezone can move a
 * calendar date across a boundary.
 */
/** `YYYY-MM-DD`: the year occupies the first four characters. */
const YEAR_END = 4;

export function yearsBetween(earlierIso: string, laterIso: string): number {
  const earlierYear = Number(earlierIso.slice(0, YEAR_END));
  const laterYear = Number(laterIso.slice(0, YEAR_END));
  const birthdayPassed = laterIso.slice(MONTH_DAY_START) >= earlierIso.slice(MONTH_DAY_START);
  return laterYear - earlierYear - (birthdayPassed ? 0 : 1);
}

/** True when the person born on `dateOfBirthIso` is at least `years` old on `todayIso`. */
export function isAtLeastAge(dateOfBirthIso: string, todayIso: string, years: number): boolean {
  return yearsBetween(dateOfBirthIso, todayIso) >= years;
}

/**
 * A calendar date `months` after `from`, UTC.
 *
 * Month arithmetic is clamped to the target month's length: 31 January plus one month
 * is 28 February, not 3 March — an expiry that drifts into the following month would
 * grant days of validity nobody decided on.
 */
export function addMonthsUtc(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const dayOfMonth = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(dayOfMonth, lastDay));
  return result;
}
