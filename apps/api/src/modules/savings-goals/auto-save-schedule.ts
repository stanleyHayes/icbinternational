/**
 * When an auto-save runs next.
 *
 * Pure calendar arithmetic over a frequency and a date. Kept apart from the service that
 * executes the transfers so the awkward cases — a monthly save set for the 31st, a run
 * that was missed while the clock was moved forward a year — can be enumerated in a unit
 * test rather than discovered in a customer's statement.
 */

import { addDays, addMonths, addWeeks } from '../loans/index.js';

/** How often an auto-save moves money. */
export const AutoSaveFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const;
export type AutoSaveFrequency = (typeof AutoSaveFrequency)[keyof typeof AutoSaveFrequency];

const ADVANCE: Readonly<Record<AutoSaveFrequency, (iso: string) => string>> = Object.freeze({
  [AutoSaveFrequency.DAILY]: (iso) => addDays(iso, 1),
  [AutoSaveFrequency.WEEKLY]: (iso) => addWeeks(iso, 1),
  [AutoSaveFrequency.MONTHLY]: (iso) => addMonths(iso, 1),
});

/**
 * The next run date strictly after `from`.
 *
 * Strictly after, so scheduling from the date a save has just run cannot produce the same
 * date again and charge a customer twice on one day.
 */
export function nextRunAfter(from: string, frequency: AutoSaveFrequency): string {
  return ADVANCE[frequency](from);
}

/**
 * How many runs are owed between a scheduled date and the business date.
 *
 * The simulated clock can jump a year in one step, and a weekly auto-save must then move
 * fifty-two weeks of money rather than one. Counting the runs, instead of assuming the job
 * sees every day, is what makes advancing time produce a year of real saving.
 *
 * @param cap The most runs one pass will catch up. A guard against an accidental decade.
 */
export function dueRuns(input: {
  nextRunOn: string;
  asOf: string;
  frequency: AutoSaveFrequency;
  cap: number;
}): string[] {
  const runs: string[] = [];
  let scheduled = input.nextRunOn;

  while (scheduled <= input.asOf && runs.length < input.cap) {
    runs.push(scheduled);
    scheduled = nextRunAfter(scheduled, input.frequency);
  }

  return runs;
}
