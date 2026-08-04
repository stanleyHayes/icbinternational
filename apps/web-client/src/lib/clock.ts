/**
 * The one place the browser reads wall-clock time.
 *
 * The banking core reads time through `ClockService`, because the operations console can move it.
 * That reasoning does not reach the browser: a customer watching a challenge count down is watching
 * *their* clock, and a countdown driven by a business clock that has been advanced a month would
 * render nonsense. So the browser's one wall-clock read lives here, behind a named function, rather
 * than being scattered through every component that needs it.
 *
 * Anything that must agree with the ledger reads a server timestamp from the API instead.
 */

const MS_PER_SECOND = 1000;

/** Milliseconds since the epoch, from the customer's device. */
export function nowMs(): number {
  return Date.now();
}

/**
 * Whole seconds between now and an ISO-8601 instant, floored at zero.
 *
 * Used for challenge and quote countdowns. An unparseable instant yields `0`, which reads as
 * "expired" — the safe direction, because it re-prompts rather than letting a stale value stand.
 */
export function secondsUntil(isoInstant: string): number {
  const target = new Date(isoInstant).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.floor((target - nowMs()) / MS_PER_SECOND));
}

/** Formats a second count as `m:ss`, the shape a countdown is read in. */
export function formatCountdown(totalSeconds: number): string {
  const SECONDS_PER_MINUTE = 60;
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
