/**
 * Parsing for the human-written durations in configuration (`15m`, `30d`).
 *
 * The JWT library can expand a timespan string itself, but only against the real wall
 * clock. Reliance Bank's clock is movable, so every expiry in this module is computed from
 * `ClockService` — which means the durations have to be converted to seconds here first.
 */

/** Seconds in each supported unit. */
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86_400,
};

const DURATION_PATTERN = /^(\d+)([smhd])$/;

/**
 * Converts a duration such as `15m` or `30d` to whole seconds.
 *
 * @throws {RangeError} for anything unparseable. A malformed TTL is a deployment fault and
 *   must stop the process at startup, not silently become a zero-second token.
 */
export function durationToSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  const amount = Number(match?.[1] ?? Number.NaN);
  const unitSeconds = UNIT_SECONDS[match?.[2] ?? ''];

  if (unitSeconds === undefined || !Number.isFinite(amount) || amount <= 0) {
    throw new RangeError(
      `Unparseable duration "${value}". Expected a positive form such as 15m, 12h or 30d.`,
    );
  }

  return amount * unitSeconds;
}
