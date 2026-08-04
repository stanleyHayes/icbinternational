import { type Period } from './period.js';

/** How finely a cashflow chart is sliced. */
export const CashflowGranularity = {
  DAY: 'DAY',
  WEEK: 'WEEK',
  MONTH: 'MONTH',
} as const;
export type CashflowGranularity = (typeof CashflowGranularity)[keyof typeof CashflowGranularity];

/** One slot on the chart's x-axis. */
export interface Bucket {
  /** Label the client renders and the client sorts by: `2026-08`, `2026-W31`, `2026-08-02`. */
  readonly period: string;
  readonly from: Date;
  readonly to: Date;
}

/**
 * Enumerates every bucket in the period, including the empty ones.
 *
 * Empty buckets are the point. A chart built only from months that had transactions draws
 * a continuous line across a gap where the customer spent nothing, which reads as steady
 * activity rather than as a pause. The zero has to be in the data for the chart to be
 * honest.
 *
 * All arithmetic is UTC. A bucket boundary computed in local time shifts under daylight
 * saving and moves a transaction booked at 23:30 on the 31st into the following month.
 */
export function enumerateBuckets(period: Period, granularity: CashflowGranularity): Bucket[] {
  const buckets: Bucket[] = [];
  let cursor = startOf(period.from, granularity);

  while (cursor <= period.to) {
    const next = advance(cursor, granularity);
    buckets.push({
      period: labelFor(cursor, granularity),
      from: cursor,
      // One millisecond short of the next boundary, so consecutive buckets neither
      // overlap nor leave a gap a transaction can fall through.
      to: new Date(Math.min(next.getTime() - 1, period.to.getTime())),
    });
    cursor = next;
  }

  return buckets;
}

/** The instant a bucket containing `at` begins. */
function startOf(at: Date, granularity: CashflowGranularity): Date {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();

  if (granularity === CashflowGranularity.MONTH) return new Date(Date.UTC(year, month, 1));
  if (granularity === CashflowGranularity.WEEK) return startOfIsoWeek(at);
  return new Date(Date.UTC(year, month, at.getUTCDate()));
}

function advance(from: Date, granularity: CashflowGranularity): Date {
  if (granularity === CashflowGranularity.MONTH) {
    return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  }
  const days = granularity === CashflowGranularity.WEEK ? DAYS_PER_WEEK : 1;
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
}

/** ISO-8601 weeks start on Monday, which is what every European bank statement assumes. */
function startOfIsoWeek(at: Date): Date {
  const day = at.getUTCDay();
  const sinceMonday = (day + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - sinceMonday));
}

function labelFor(at: Date, granularity: CashflowGranularity): string {
  const iso = at.toISOString();

  if (granularity === CashflowGranularity.MONTH) return iso.slice(0, MONTH_LABEL_LENGTH);
  if (granularity === CashflowGranularity.DAY) return iso.slice(0, DAY_LABEL_LENGTH);
  return isoWeekLabel(at);
}

/**
 * `YYYY-Www`, with the ISO-8601 week-numbering year.
 *
 * The week-numbering year is not always the calendar year: 1 January 2027 falls in week
 * 53 of 2026. Labelling it `2027-W53` would sort a week into the wrong year on the chart,
 * which is exactly the bug this rule exists to prevent.
 */
function isoWeekLabel(at: Date): string {
  const monday = startOfIsoWeek(at);
  const thursday = new Date(monday.getTime() + THURSDAY_OFFSET_DAYS * MILLISECONDS_PER_DAY);
  const year = thursday.getUTCFullYear();

  // The Monday of week 1, found from 4 January, which is in week 1 by definition.
  const firstMonday = startOfIsoWeek(new Date(Date.UTC(year, 0, FOURTH_OF_JANUARY)));
  const week = Math.round((monday.getTime() - firstMonday.getTime()) / MILLISECONDS_PER_WEEK) + 1;

  return `${year}-W${String(week).padStart(2, '0')}`;
}

const DAYS_PER_WEEK = 7;
const MONTH_LABEL_LENGTH = 7;
const DAY_LABEL_LENGTH = 10;
const MILLISECONDS_PER_DAY = 86_400_000;
const MILLISECONDS_PER_WEEK = MILLISECONDS_PER_DAY * DAYS_PER_WEEK;
/** Monday plus three days is Thursday, the day that determines an ISO week's year. */
const THURSDAY_OFFSET_DAYS = 3;
/** 4 January is always in ISO week 1, by definition. */
const FOURTH_OF_JANUARY = 4;
