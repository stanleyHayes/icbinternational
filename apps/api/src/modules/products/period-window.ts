import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { COUNTER_RETENTION_DAYS, TWO_DIGITS, YEAR_DIGITS } from './product.constants.js';

/**
 * Calendar windows in the customer's own timezone.
 *
 * A "daily limit" that resets at UTC midnight resets at 1am for a customer in London
 * during British Summer Time, which means their Friday-night spending is charged against
 * Saturday's allowance. Counters are therefore keyed by the *local* calendar day, and the
 * reset instant is the next local midnight — the moment the customer would expect their
 * allowance back.
 *
 * DST is handled by resolving the offset twice: once at the naive instant and once at the
 * corrected one. On a spring-forward day the first guess lands inside the skipped hour and
 * the second pass moves it to the real boundary.
 */

/** A counter window: the key it is stored under and the instant it rolls over. */
export interface PeriodWindow {
  /** `YYYY-MM-DD` for a day, `YYYY-MM` for a month. Part of the counter's natural key. */
  readonly key: string;
  /** Instant the allowance returns to full. Surfaced to the customer, so it must be exact. */
  readonly resetsAt: Date;
}

/** Local calendar day containing `instant`, and the next local midnight. */
export function dayWindow(instant: Date, timeZone: string): PeriodWindow {
  const parts = wallClockIn(instant, timeZone);
  const tomorrow = shiftDays(parts, 1);

  return {
    key: `${padYear(parts.year)}-${pad(parts.month)}-${pad(parts.day)}`,
    resetsAt: localMidnight(tomorrow, timeZone),
  };
}

/** Local calendar month containing `instant`, and midnight on the first of the next one. */
export function monthWindow(instant: Date, timeZone: string): PeriodWindow {
  const parts = wallClockIn(instant, timeZone);
  const nextMonth = { year: parts.year, month: parts.month + 1, day: 1 };

  return {
    key: `${padYear(parts.year)}-${pad(parts.month)}`,
    resetsAt: localMidnight(nextMonth, timeZone),
  };
}

/**
 * When a counter for a window that reset at `resetsAt` may be deleted.
 *
 * A counter is dead the instant its window rolls, but support answers "why was my card
 * declined yesterday?" and the answer is in the counter that caused it.
 */
export function retentionEnd(resetsAt: Date): Date {
  return new Date(resetsAt.getTime() + COUNTER_RETENTION_DAYS * MILLISECONDS_PER_DAY);
}

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Validates a timezone and returns it, or throws.
 *
 * Called once where the preference enters the system rather than on every counter read,
 * because an unrecognised zone is a data problem, not a per-request condition.
 */
export function assertTimeZone(timeZone: string): string {
  formatterFor(timeZone);
  return timeZone;
}

// --- Wall-clock conversion -------------------------------------------------

/** A local date, and optionally a local time, with month and day one-based. */
interface WallClock {
  year: number;
  month: number;
  day: number;
}

/**
 * Constructing an `Intl.DateTimeFormat` costs roughly as much as formatting a thousand
 * dates. Limit checks run on every authorisation, so the formatters are built once.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timeZone);
  if (cached) return cached;

  const formatter = buildFormatter(timeZone);
  FORMATTERS.set(timeZone, formatter);
  return formatter;
}

function buildFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (cause) {
    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: `\`${timeZone}\` is not a recognised IANA timezone`,
      cause,
    });
  }
}

/** The wall-clock reading a customer in `timeZone` would see at `instant`. */
function wallClockIn(instant: Date, timeZone: string): WallClock & { millis: number } {
  const parts = new Map(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );

  const year = numberPart(parts, 'year');
  const month = numberPart(parts, 'month');
  const day = numberPart(parts, 'day');
  const hour = numberPart(parts, 'hour');
  const minute = numberPart(parts, 'minute');
  const second = numberPart(parts, 'second');

  return { year, month, day, millis: Date.UTC(year, month - 1, day, hour, minute, second) };
}

function numberPart(parts: Map<string, string>, type: string): number {
  const raw = parts.get(type);
  if (raw === undefined) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: `The date formatter produced no \`${type}\` part`,
    });
  }
  return Number.parseInt(raw, 10);
}

/** Milliseconds the zone is ahead of UTC at `instant`. Negative west of Greenwich. */
function offsetMsAt(instant: Date, timeZone: string): number {
  return wallClockIn(instant, timeZone).millis - instant.getTime();
}

/** The instant at which local midnight on `date` occurs in `timeZone`. */
function localMidnight(date: WallClock, timeZone: string): Date {
  const wallMillis = Date.UTC(date.year, date.month - 1, date.day);

  // Subtracting the offset observed *at the wrong instant* is only approximately right
  // across a DST boundary; the second pass uses the offset actually in force there.
  const approximate = new Date(wallMillis - offsetMsAt(new Date(wallMillis), timeZone));
  return new Date(wallMillis - offsetMsAt(approximate, timeZone));
}

/** Adds days with month and year rollover handled by the Date arithmetic itself. */
function shiftDays(date: WallClock, days: number): WallClock {
  const rolled = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: rolled.getUTCFullYear(),
    month: rolled.getUTCMonth() + 1,
    day: rolled.getUTCDate(),
  };
}

function pad(value: number): string {
  return String(value).padStart(TWO_DIGITS, '0');
}

function padYear(value: number): string {
  return String(value).padStart(YEAR_DIGITS, '0');
}
