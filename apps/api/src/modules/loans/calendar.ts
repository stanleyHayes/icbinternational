/**
 * Calendar arithmetic for credit products.
 *
 * Instalment dates, maturity dates and accrual windows are month- or day-granular, and
 * every one of them is derived in UTC. A loan drawn on the 31st must fall due on the 30th
 * in April rather than rolling into May, and a customer reading their schedule from
 * another time zone must never see a due date one day off the one the schedule was built
 * with. Both of those are calendar bugs that only show up in production, in a minority of
 * months, so the rules live in one tested file rather than inline at each call site.
 */

const ISO_DATE_LENGTH = 10;
const MILLISECONDS_PER_DAY = 86_400_000;
const MONTHS_PER_YEAR = 12;
const FIRST_DAY_OF_MONTH = 1;
const DAYS_PER_WEEK = 7;

/** `YYYY-MM-DD` for an instant, in UTC. */
export function toIsoDate(instant: Date): string {
  return instant.toISOString().slice(0, ISO_DATE_LENGTH);
}

/**
 * Midnight UTC on an ISO calendar date.
 *
 * @throws {RangeError} when the string is not a calendar date this module can work with.
 */
export function fromIsoDate(iso: string): Date {
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new RangeError(`Not a calendar date: ${iso}`);
  return parsed;
}

/** The same calendar date `days` later. Negative values move backwards. */
export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(fromIsoDate(iso).getTime() + days * MILLISECONDS_PER_DAY));
}

/** The same calendar date `weeks` later. */
export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * DAYS_PER_WEEK);
}

/**
 * The same day-of-month `months` later, clamped to the end of the target month.
 *
 * 31 January plus one month is 28 February (29 in a leap year), not 3 March. Clamping
 * rather than overflowing is what keeps a monthly instalment inside the month it belongs
 * to, and it is why a 31st-of-the-month loan does not silently acquire a thirteenth
 * instalment date over a year.
 */
export function addMonths(iso: string, months: number): string {
  const source = fromIsoDate(iso);
  const dayOfMonth = source.getUTCDate();

  const target = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, FIRST_DAY_OF_MONTH),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  target.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  return toIsoDate(target);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / MILLISECONDS_PER_DAY,
  );
}

/**
 * Whole calendar months from `from` to `to`, rounded down.
 *
 * A partial month does not count: 15 March to 14 April is nought months, and 15 April is
 * one. Savings projections divide a shortfall by this number, so counting a part-month as
 * a whole one would understate what the customer has to put aside.
 */
export function monthsBetween(from: string, to: string): number {
  const start = fromIsoDate(from);
  const end = fromIsoDate(to);

  const grossMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * MONTHS_PER_YEAR +
    (end.getUTCMonth() - start.getUTCMonth());

  return end.getUTCDate() < start.getUTCDate() ? grossMonths - 1 : grossMonths;
}

/** True when `left` is strictly earlier than `right`. */
export function isBefore(left: string, right: string): boolean {
  return left < right;
}

/** The later of two calendar dates. */
export function laterOf(left: string, right: string): string {
  return left > right ? left : right;
}
