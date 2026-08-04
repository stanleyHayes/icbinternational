/**
 * The window a statement covers, and the calendar arithmetic that produces one.
 *
 * Every boundary here is UTC and inclusive at both ends: a statement for January covers
 * the first millisecond of the first to the last millisecond of the thirty-first. A
 * half-open end would drop anything booked in the final second of the month, and the
 * customer would find it on neither statement.
 *
 * Pure on purpose — no clock, no store. The caller supplies "now"; that is what lets a
 * test assert February 2024 has twenty-nine days without moving the machine's date.
 */

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { MAX_STATEMENT_DAYS, STATEMENT_ARCHIVE_MONTHS } from './statements.constants.js';

/** A statement's window, resolved to exact instants. */
export interface StatementPeriod {
  /** `YYYY-MM` for a calendar month; `YYYY-MM-DD to YYYY-MM-DD` for anything else. */
  readonly label: string;
  /** First instant covered. */
  readonly start: Date;
  /** Last instant covered, to the millisecond. */
  readonly end: Date;
  /** `YYYY-MM-DD` of {@link start}, the wire form the contract asks for. */
  readonly startDay: string;
  /** `YYYY-MM-DD` of {@link end}. */
  readonly endDay: string;
}

const ISO_DAY_LENGTH = 10;
const MONTHS_PER_YEAR = 12;
const LAST_MILLISECOND = 86_399_999;
const MILLISECONDS_PER_DAY = 86_400_000;
const YEAR_DIGITS = 4;

/** The whole of one calendar month, from a zero-based month index. */
export function monthlyPeriod(year: number, month: number): StatementPeriod {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1) - 1);

  return {
    label: `${String(year).padStart(YEAR_DIGITS, '0')}-${String(month + 1).padStart(2, '0')}`,
    start,
    end,
    startDay: isoDay(start),
    endDay: isoDay(end),
  };
}

/**
 * The complete months the bank has a statement for, newest first.
 *
 * The month in progress is excluded. A statement is a closed period — issuing one for a
 * month that still has payments to come would give the customer a document whose closing
 * balance is wrong by tomorrow, and they would have no way of telling which copy they
 * were holding.
 */
export function archivePeriods(input: {
  openedAt: Date;
  asOf: Date;
  limit: number;
}): StatementPeriod[] {
  const first = monthIndex(input.openedAt);
  const last = monthIndex(input.asOf) - 1;
  const floor = Math.max(first, last - STATEMENT_ARCHIVE_MONTHS + 1);
  const periods: StatementPeriod[] = [];

  for (let index = last; index >= floor && periods.length < input.limit; index -= 1) {
    periods.push(monthlyPeriod(Math.floor(index / MONTHS_PER_YEAR), index % MONTHS_PER_YEAR));
  }

  return periods;
}

/**
 * An ad-hoc range the customer chose, from two `YYYY-MM-DD` dates.
 *
 * A range wider than a year is refused rather than truncated. Truncating would answer a
 * question nobody asked with a document that looks exactly like the one they wanted.
 *
 * @throws {AppError} `VALIDATION_FAILED` for an inverted or over-long range.
 */
export function customPeriod(from: string, to: string): StatementPeriod {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + LAST_MILLISECOND);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw badPeriod('A statement period must be two calendar dates.');
  }
  if (start > end) {
    throw badPeriod('The start of the period must not be after its end.');
  }
  if (spanInDays(start, end) > MAX_STATEMENT_DAYS) {
    throw badPeriod(`A statement covers at most ${MAX_STATEMENT_DAYS} days. Ask for two.`);
  }

  return { label: `${isoDay(start)} to ${isoDay(end)}`, start, end, startDay: from, endDay: to };
}

/** Rebuilds a period from the two day numbers a statement identifier carries. */
export function periodFromDays(startDay: number, endDay: number): StatementPeriod {
  const start = new Date(startDay * MILLISECONDS_PER_DAY);
  const end = new Date(endDay * MILLISECONDS_PER_DAY + LAST_MILLISECOND);
  const monthly = monthlyPeriod(start.getUTCFullYear(), start.getUTCMonth());

  // A period that lands exactly on a month's boundaries is that month, and is labelled as
  // one — the identifier carries days, not the intent that produced them.
  if (monthly.start.getTime() === start.getTime() && monthly.end.getTime() === end.getTime()) {
    return monthly;
  }

  return {
    label: `${isoDay(start)} to ${isoDay(end)}`,
    start,
    end,
    startDay: isoDay(start),
    endDay: isoDay(end),
  };
}

/** Whole days since the epoch. The unit a statement identifier stores its bounds in. */
export function dayNumber(at: Date): number {
  return Math.floor(at.getTime() / MILLISECONDS_PER_DAY);
}

/** `YYYY-MM-DD`, UTC. */
export function isoDay(at: Date): string {
  return at.toISOString().slice(0, ISO_DAY_LENGTH);
}

/** Months since year zero, so two calendar months can be compared and stepped through. */
function monthIndex(at: Date): number {
  return at.getUTCFullYear() * MONTHS_PER_YEAR + at.getUTCMonth();
}

function spanInDays(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / MILLISECONDS_PER_DAY);
}

function badPeriod(message: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_FAILED, message });
}
