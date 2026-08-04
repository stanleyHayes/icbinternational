/**
 * When a standing order falls due.
 *
 * Pure calendar arithmetic, kept apart from anything that stores or moves money so the
 * awkward cases can be enumerated in a unit test rather than discovered in somebody's
 * rent. Three of them decide the shape of this file:
 *
 * **Month-ends clamp, they do not skip.** An order set for the 31st pays on 28 February,
 * and on 31 March. That only holds if every occurrence is derived from the anchor month
 * rather than from the previous payment — add a month to 28 February and the order has
 * quietly moved to the 28th forever.
 *
 * **Occurrences are found, not counted forward.** A resume after six months paused, or a
 * clock advanced a year, must land on the next real date in one step rather than by
 * walking every occurrence in between.
 *
 * **Dates are calendar dates in UTC.** A standing order runs on a day, not at an instant,
 * and a customer reading their schedule from another time zone must not see it a day out.
 */

import { RecurrenceFrequency } from '@reliance/contracts';

import { addDays, daysBetween, fromIsoDate, laterOf, toIsoDate } from '../loans/index.js';

const DAYS_PER_WEEK = 7;
const DAYS_PER_FORTNIGHT = 14;
const MONTHS_PER_QUARTER = 3;
/** Declared here rather than borrowed from the loans lane, whose copy is a bigint for rate maths. */
const MONTHS_PER_YEAR = 12;
const FIRST_OF_MONTH = 1;
/** ISO weekday for Sunday. The contract numbers Monday 1 … Sunday 7; JavaScript numbers it 0. */
const SUNDAY = 7;

/** The recurrence rule as the schedule sees it: a cadence, an anchor and two stopping conditions. */
export interface Schedule {
  readonly frequency: RecurrenceFrequency;
  readonly dayOfMonth: number | null;
  readonly dayOfWeek: number | null;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly maxOccurrences: number | null;
}

/** Months between occurrences, for the frequencies anchored to a day of the month. */
const MONTH_STEP: Partial<Record<RecurrenceFrequency, number>> = {
  [RecurrenceFrequency.MONTHLY]: 1,
  [RecurrenceFrequency.QUARTERLY]: MONTHS_PER_QUARTER,
  [RecurrenceFrequency.ANNUAL]: MONTHS_PER_YEAR,
};

/** Days between occurrences, for the frequencies anchored to a weekday. */
const DAY_STEP: Partial<Record<RecurrenceFrequency, number>> = {
  [RecurrenceFrequency.WEEKLY]: DAYS_PER_WEEK,
  [RecurrenceFrequency.FORTNIGHTLY]: DAYS_PER_FORTNIGHT,
};

/** The first payment date, or null when the rule describes no payment at all. */
export function firstRunOn(schedule: Schedule): string | null {
  return runOnOrAfter(schedule, schedule.startsOn, 0);
}

/**
 * The next payment date strictly after `after`.
 *
 * Strictly after, so recomputing from the date a payment has just run — or been skipped —
 * cannot return the same date and take the money twice on one day.
 */
export function nextRunOn(
  schedule: Schedule,
  state: { after: string; occurrencesRun: number },
): string | null {
  return runOnOrAfter(schedule, addDays(state.after, 1), state.occurrencesRun);
}

/**
 * The next payment date on or after `from`.
 *
 * What a resume and an amendment need: the date already booked still counts if it has not
 * passed, and only a date in the past is moved on.
 */
export function runFrom(
  schedule: Schedule,
  state: { from: string; occurrencesRun: number },
): string | null {
  return runOnOrAfter(schedule, state.from, state.occurrencesRun);
}

/**
 * The day fields that mean something for a frequency, defaulted from the start date.
 *
 * A weekly order needs a weekday and a monthly one needs a day of the month; neither
 * needs the other, and a daily or one-off order needs neither. Defaulting from `startsOn`
 * means a customer who picks "every month, starting the 12th" gets the 12th without
 * having to say so twice, and the fields that do not apply are stored as null rather than
 * as a value that would silently start mattering if the frequency were ever amended.
 */
export function anchorsFor(input: {
  frequency: RecurrenceFrequency;
  startsOn: string;
  dayOfMonth?: number;
  dayOfWeek?: number;
}): { dayOfMonth: number | null; dayOfWeek: number | null } {
  const start = fromIsoDate(input.startsOn);

  if (MONTH_STEP[input.frequency]) {
    return { dayOfMonth: input.dayOfMonth ?? start.getUTCDate(), dayOfWeek: null };
  }
  if (DAY_STEP[input.frequency]) {
    return { dayOfMonth: null, dayOfWeek: input.dayOfWeek ?? isoWeekday(start) };
  }
  return { dayOfMonth: null, dayOfWeek: null };
}

/** An occurrence on or after `from`, once the two stopping conditions have had their say. */
function runOnOrAfter(schedule: Schedule, from: string, occurrencesRun: number): string | null {
  if (schedule.maxOccurrences !== null && occurrencesRun >= schedule.maxOccurrences) return null;

  const candidate = occurrenceOnOrAfter(schedule, laterOf(from, schedule.startsOn));
  if (candidate === null) return null;

  return schedule.endsOn !== null && candidate > schedule.endsOn ? null : candidate;
}

/** The cadence, ignoring the end date and the occurrence cap. `target` is never before `startsOn`. */
function occurrenceOnOrAfter(schedule: Schedule, target: string): string | null {
  if (schedule.frequency === RecurrenceFrequency.ONCE) {
    return schedule.startsOn >= target ? schedule.startsOn : null;
  }
  if (schedule.frequency === RecurrenceFrequency.DAILY) return target;

  const monthStep = MONTH_STEP[schedule.frequency];
  if (monthStep !== undefined) {
    return monthlyOccurrence(schedule.startsOn, schedule.dayOfMonth, monthStep, target);
  }

  const dayStep = DAY_STEP[schedule.frequency];
  if (dayStep !== undefined) {
    return weeklyOccurrence(schedule.startsOn, schedule.dayOfWeek, dayStep, target);
  }

  return null;
}

/**
 * The first date on the month grid that falls on or after `target`.
 *
 * The grid is anchored to the month `startsOn` falls in, and each date is built from the
 * anchor's day-of-month clamped to the target month's length. Jumping straight to the
 * right month rather than stepping through them is what makes a resume after a long pause
 * cost the same as a resume after a day.
 */
function monthlyOccurrence(
  startsOn: string,
  dayOfMonth: number | null,
  step: number,
  target: string,
): string {
  const anchor = fromIsoDate(startsOn);
  const day = dayOfMonth ?? anchor.getUTCDate();
  const at = fromIsoDate(target);

  const monthsAhead =
    (at.getUTCFullYear() - anchor.getUTCFullYear()) * MONTHS_PER_YEAR +
    (at.getUTCMonth() - anchor.getUTCMonth());

  let steps = Math.max(0, Math.ceil(monthsAhead / step));
  let candidate = dayInMonth(anchor, steps * step, day);

  // At most one further step: landing in the right month can still put the day behind the
  // target, e.g. an order for the 5th evaluated on the 20th.
  while (candidate < target) {
    steps += 1;
    candidate = dayInMonth(anchor, steps * step, day);
  }

  return candidate;
}

/** The `day`-th of the month `monthsAhead` after `from`, clamped to that month's last day. */
function dayInMonth(from: Date, monthsAhead: number, day: number): string {
  const month = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + monthsAhead, FIRST_OF_MONTH),
  );
  const lastDay = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();

  month.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(month);
}

/** The first date on the weekday grid that falls on or after `target`. */
function weeklyOccurrence(
  startsOn: string,
  dayOfWeek: number | null,
  step: number,
  target: string,
): string {
  const base = firstWeekdayOnOrAfter(startsOn, dayOfWeek ?? isoWeekday(fromIsoDate(startsOn)));
  if (target <= base) return base;

  const elapsed = daysBetween(base, target);
  return addDays(base, Math.ceil(elapsed / step) * step);
}

/** The first `dayOfWeek` on or after a calendar date. */
function firstWeekdayOnOrAfter(iso: string, dayOfWeek: number): string {
  const shift = (dayOfWeek - isoWeekday(fromIsoDate(iso)) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(iso, shift);
}

/** ISO weekday, 1 = Monday … 7 = Sunday — the contract's numbering, not JavaScript's. */
function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? SUNDAY : day;
}
