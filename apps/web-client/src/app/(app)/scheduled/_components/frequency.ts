'use client';

/**
 * How often a standing order runs, in words.
 *
 * `FORTNIGHTLY` is a value in an enum; "every two weeks" is what somebody setting up a payment to
 * a childminder understands. The month-end rule is stated too, because "the 31st" in February is
 * the single most common surprise in standing orders.
 */

import { RecurrenceFrequency } from '@reliance/contracts';
import type { SelectOption } from '@reliance/ui';

/** The customer-facing name of each frequency. */
export const FREQUENCY_LABEL: Readonly<Record<RecurrenceFrequency, string>> = {
  [RecurrenceFrequency.ONCE]: 'Once, on the date you choose',
  [RecurrenceFrequency.DAILY]: 'Every day',
  [RecurrenceFrequency.WEEKLY]: 'Every week',
  [RecurrenceFrequency.FORTNIGHTLY]: 'Every two weeks',
  [RecurrenceFrequency.MONTHLY]: 'Every month',
  [RecurrenceFrequency.QUARTERLY]: 'Every three months',
  [RecurrenceFrequency.ANNUAL]: 'Every year',
};

/** The frequencies offered when setting one up, in the order people choose them. */
export const FREQUENCY_OPTIONS: readonly SelectOption[] = [
  RecurrenceFrequency.MONTHLY,
  RecurrenceFrequency.WEEKLY,
  RecurrenceFrequency.FORTNIGHTLY,
  RecurrenceFrequency.QUARTERLY,
  RecurrenceFrequency.ANNUAL,
  RecurrenceFrequency.DAILY,
  RecurrenceFrequency.ONCE,
].map((value) => ({ value, label: FREQUENCY_LABEL[value] }));

/** Frequencies where the customer picks a day of the month. */
export const MONTHLY_LIKE: ReadonlySet<RecurrenceFrequency> = new Set([
  RecurrenceFrequency.MONTHLY,
  RecurrenceFrequency.QUARTERLY,
  RecurrenceFrequency.ANNUAL,
]);

/** Frequencies where the customer picks a day of the week. */
export const WEEKLY_LIKE: ReadonlySet<RecurrenceFrequency> = new Set([
  RecurrenceFrequency.WEEKLY,
  RecurrenceFrequency.FORTNIGHTLY,
]);

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_IN_MONTH = 31;

/** Weekdays as options, numbered the way the contract numbers them. */
export const DAY_OF_WEEK_OPTIONS: readonly SelectOption[] = DAY_NAMES.map((label, index) => ({
  value: String(index + 1),
  label,
}));

/** Days of the month as options. Month-ends clamp rather than skip, and the copy says so. */
export const DAY_OF_MONTH_OPTIONS: readonly SelectOption[] = Array.from(
  { length: DAYS_IN_MONTH },
  (_unused, index) => ({ value: String(index + 1), label: `Day ${index + 1}` }),
);

/** The note shown under a day-of-month picker for the days that do not exist every month. */
export const MONTH_END_NOTE =
  'If a month is shorter than the day you pick, we take the payment on the last day of that month.';
