/**
 * Dense formatting for operational screens.
 *
 * A customer app rounds a timestamp to "yesterday". A back office cannot: an operator
 * reconciling a rail exception needs the second, and needs every row to occupy the same
 * width so the column can be scanned rather than read. Everything here is fixed-width,
 * unambiguous and locale-independent by design.
 *
 * Nothing in this file reads the clock. "Now" is always a parameter, because the bank's
 * idea of now is set by its business date, not by the operator's laptop.
 */

/** Locale used for every operational timestamp — ISO-like ordering, no local surprises. */
const OPS_LOCALE = 'en-GB';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;
const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;

/** Characters kept from each end of an identifier when it is shortened for a column. */
const ID_TAIL_LENGTH = 4;

const dateTimeFormat = new Intl.DateTimeFormat(OPS_LOCALE, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const dateFormat = new Intl.DateTimeFormat(OPS_LOCALE, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
});

/** Placeholder for a field the platform returned as absent. */
const NOT_SET = '—';

/**
 * A full timestamp, to the second, in UTC: `03/08/2026, 14:22:07`.
 *
 * UTC rather than the operator's zone because two colleagues in different offices must
 * be able to read the same audit line and agree on what happened first.
 */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return NOT_SET;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? NOT_SET : dateTimeFormat.format(value);
}

/** A date without the time, for columns where the time is noise. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_SET;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? NOT_SET : dateFormat.format(value);
}

function elapsedLabel(deltaMs: number): string {
  if (deltaMs < MS_PER_MINUTE) return `${Math.floor(deltaMs / MS_PER_SECOND)}s`;
  if (deltaMs < MS_PER_HOUR) return `${Math.floor(deltaMs / MS_PER_MINUTE)}m`;
  if (deltaMs < MS_PER_DAY) return `${Math.floor(deltaMs / MS_PER_HOUR)}h`;
  return `${Math.floor(deltaMs / MS_PER_DAY)}d`;
}

/**
 * How long ago, or how long until — `4m ago`, `in 2h`.
 *
 * Used for SLA clocks and queue ages, where the exact instant matters less than whether
 * the operator is about to breach something. Pair it with {@link formatInstant} in a
 * tooltip or a `title` so the precise time is always one hover away.
 *
 * @param iso The instant being described.
 * @param nowMs The bank's current instant, in epoch milliseconds.
 */
export function formatElapsed(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return NOT_SET;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return NOT_SET;

  const delta = nowMs - target;
  if (delta < 0) return `in ${elapsedLabel(-delta)}`;
  return `${elapsedLabel(delta)} ago`;
}

/** True when the deadline has passed. Used to colour and word an SLA cell. */
export function isOverdue(dueIso: string | null | undefined, nowMs: number): boolean {
  if (!dueIso) return false;
  const due = new Date(dueIso).getTime();
  return !Number.isNaN(due) && due < nowMs;
}

/**
 * Shortens a prefixed ULID for a dense column: `usr_01J8…N4K2`.
 *
 * The prefix is kept because it is the type of the thing, and the tail is kept because
 * that is the part an operator compares when two ids are open side by side.
 */
export function shortenId(id: string): string {
  const separator = id.indexOf('_');
  if (separator === -1 || id.length <= separator + 1 + ID_TAIL_LENGTH * 2) return id;

  const prefix = id.slice(0, separator + 1);
  const body = id.slice(separator + 1);
  return `${prefix}${body.slice(0, ID_TAIL_LENGTH)}…${body.slice(-ID_TAIL_LENGTH)}`;
}

/** Basis points as a percentage: `250` becomes `2.50%`. */
export function formatBasisPoints(bps: number): string {
  const BPS_PER_PERCENT = 100;
  const DECIMAL_PLACES = 2;
  return `${(bps / BPS_PER_PERCENT).toFixed(DECIMAL_PLACES)}%`;
}

/** A whole number with thousands separators, for counts in KPI tiles and queue depths. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(OPS_LOCALE).format(value);
}

/** Days between two instants, rounded down. Negative when the first is later. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.floor((to - from) / MS_PER_DAY);
}

/**
 * A contract enum as a person would say it: `MORE_INFO_REQUIRED` becomes
 * `More info required`.
 *
 * Raw codes on screen are how a console teaches its operators to speak in codes, which
 * then leaks into the notes they write and the emails they send to customers.
 */
export function humaniseCode(code: string): string {
  const words = code.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Whole weeks, for ageing buckets on an arrears or queue report. */
export function weeksBetween(fromIso: string, toIso: string): number {
  return Math.floor(daysBetween(fromIso, toIso) / DAYS_PER_WEEK);
}
