/**
 * Display formatting for the figures that are not money.
 *
 * Rates arrive as integer basis points and stay integers all the way to the screen. A
 * rate rendered by dividing by 10,000 is a float, and `4.25` is one of the values that
 * survives the trip — right up until the day it is `4.249999999999999`.
 */

const BPS_PER_PERCENT = 100;
const DECIMAL_PLACES = 2;
const METRES_PER_KILOMETRE = 1000;
const KILOMETRE_THRESHOLD_METRES = 950;
/** Distances are shown to one decimal place, so the maths is done in tenths of a kilometre. */
const TENTHS = 10;

/**
 * Formats basis points as a percentage.
 *
 * @example formatBps(425)  // "4.25%"
 * @example formatBps(400)  // "4%"
 * @example formatBps(899)  // "8.99%"
 */
export function formatBps(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / BPS_PER_PERCENT);
  const remainder = Math.abs(basisPoints % BPS_PER_PERCENT);

  if (remainder === 0) return `${String(whole)}%`;

  const fraction = String(remainder).padStart(DECIMAL_PLACES, '0').replace(/0$/, '');
  return `${String(whole)}.${fraction}%`;
}

/** Formats basis points as an AER, which is how a savings rate must be quoted. */
export function formatAer(basisPoints: number): string {
  return `${formatBps(basisPoints)} AER`;
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * An ISO date or timestamp as `4 August 2026`.
 *
 * Fixed to UTC so the server's render and the browser's hydration agree. Formatting in
 * the visitor's own zone would move the date by a day for anyone west of Greenwich, and
 * React would replace the text after hydration — which is a layout shift on a rate table.
 */
export function formatDate(iso: string): string {
  return LONG_DATE.format(new Date(iso));
}

/** The same date, abbreviated, for lists and cards. */
export function formatShortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}

/** A distance in metres as `450 m` or `2.3 km`. */
export function formatDistance(metres: number): string {
  if (metres < KILOMETRE_THRESHOLD_METRES) return `${String(Math.round(metres))} m`;

  const tenthsOfKm = Math.round((metres * TENTHS) / METRES_PER_KILOMETRE);
  const whole = Math.trunc(tenthsOfKm / TENTHS);
  const tenth = tenthsOfKm % TENTHS;

  return tenth === 0 ? `${String(whole)} km` : `${String(whole)}.${String(tenth)} km`;
}

/** A term in months as the phrase a customer would use. */
export function formatTerm(months: number): string {
  const MONTHS_PER_YEAR = 12;
  if (months < MONTHS_PER_YEAR) return `${String(months)} months`;

  const years = Math.trunc(months / MONTHS_PER_YEAR);
  const remainder = months % MONTHS_PER_YEAR;
  const yearLabel = years === 1 ? '1 year' : `${String(years)} years`;

  return remainder === 0 ? yearLabel : `${yearLabel} ${String(remainder)} months`;
}
