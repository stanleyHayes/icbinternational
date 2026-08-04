/**
 * Quiet hours.
 *
 * A customer who has asked not to be woken at 3am has asked about *marketing and routine
 * notices*. They have not asked us to sit on a message telling them someone is signing
 * into their account from another country — so an urgent message ignores this file
 * entirely, and the caller is responsible for not consulting it.
 *
 * Windows are expressed in the customer's own timezone and routinely wrap midnight
 * (`22:00`–`07:00`), which is the case every naive implementation gets wrong.
 *
 * Pure. `Intl` is used for the timezone conversion rather than a date library, because it
 * is the only source in the runtime that actually knows about daylight saving.
 */

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const MILLISECONDS_PER_MINUTE = 60_000;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface QuietWindow {
  /** `HH:mm`, inclusive. */
  readonly from: string;
  /** `HH:mm`, exclusive. */
  readonly to: string;
}

/** Minutes since midnight for a `HH:mm` string, or `null` when it is not one. */
export function parseClockTime(value: string): number | null {
  const match = CLOCK_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

/**
 * Minutes since midnight for `instant`, read in `timezone`.
 *
 * @throws {RangeError} when the timezone is not one the runtime recognises. Callers pass
 *   a stored preference, so an invalid value is a data problem worth surfacing rather than
 *   silently treating as UTC — which would put a customer's quiet hours hours out.
 */
export function minutesOfDayIn(instant: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  // `en-GB` renders midnight as `24:00`, which is the same instant as `00:00`.
  return (hour % HOURS_PER_DAY) * MINUTES_PER_HOUR + minute;
}

/** True when `instant` falls inside the window, midnight-wrapping windows included. */
export function isWithinQuietHours(instant: Date, window: QuietWindow, timezone: string): boolean {
  const from = parseClockTime(window.from);
  const to = parseClockTime(window.to);
  if (from === null || to === null || from === to) return false;

  const now = minutesOfDayIn(instant, timezone);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/**
 * The instant the window next opens.
 *
 * Computed by adding the remaining minutes to `instant`, rather than by constructing a
 * local date and converting back. Adding minutes to an instant is unambiguous; building
 * "07:00 tomorrow in Europe/London" is not, on the two nights a year when that hour is
 * skipped or repeated.
 */
export function quietHoursEndAfter(instant: Date, window: QuietWindow, timezone: string): Date {
  const to = parseClockTime(window.to);
  if (to === null) return instant;

  const now = minutesOfDayIn(instant, timezone);
  const untilEnd = (to - now + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const minutes = untilEnd === 0 ? MINUTES_PER_DAY : untilEnd;

  return new Date(instant.getTime() + minutes * MILLISECONDS_PER_MINUTE);
}

/** True when the runtime recognises the timezone. */
export function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}
