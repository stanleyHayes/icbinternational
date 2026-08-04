/**
 * The mock bank's clock.
 *
 * Fixtures are dated relative to a fixed epoch rather than to `Date.now()`. Two runs a
 * day apart must produce identical fixtures, and a "last 30 days" chart built against
 * real time would silently change shape between a screenshot and its baseline.
 *
 * The clock is also advanceable, because `client.simulation.advance()` has to do
 * something observable in the mocks or the simulation console cannot be built against
 * them.
 */

/** The instant every fixture is dated from. Matches the repo's working date. */
export const MOCK_EPOCH_MS = Date.UTC(2026, 7, 2, 9, 0, 0);

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** A movable simulated clock. */
export class MockClock {
  private currentMs = MOCK_EPOCH_MS;

  private isFrozen = true;

  /** Simulated now, as an ISO-8601 UTC instant with the `Z` the contract requires. */
  nowIso(): string {
    return new Date(this.currentMs).toISOString();
  }

  /** Simulated now, as a calendar date. */
  todayIso(): string {
    return this.nowIso().slice(0, DATE_LENGTH);
  }

  /** Simulated now in epoch milliseconds. */
  nowMs(): number {
    return this.currentMs;
  }

  /** Whether the clock is held still. Always true in the mocks unless a test moves it. */
  get frozen(): boolean {
    return this.isFrozen;
  }

  /** Offset from the real epoch, in seconds — what `SimClock.offsetSeconds` reports. */
  get offsetSeconds(): number {
    return Math.round((this.currentMs - MOCK_EPOCH_MS) / MS_PER_SECOND);
  }

  /** Moves the clock forward. Returns the new instant. */
  advance(input: { days?: number; hours?: number; minutes?: number }): string {
    this.currentMs +=
      (input.days ?? 0) * MS_PER_DAY +
      (input.hours ?? 0) * MS_PER_HOUR +
      (input.minutes ?? 0) * MS_PER_MINUTE;
    return this.nowIso();
  }

  /** Freezes or unfreezes. */
  setFrozen(frozen: boolean): void {
    this.isFrozen = frozen;
  }

  /** Returns the clock to the epoch. */
  reset(): void {
    this.currentMs = MOCK_EPOCH_MS;
    this.isFrozen = true;
  }

  /** An instant `days` in the past, for back-dating fixture history. */
  daysAgo(days: number): string {
    return new Date(this.currentMs - days * MS_PER_DAY).toISOString();
  }

  /** An instant `days` in the future. */
  daysAhead(days: number): string {
    return new Date(this.currentMs + days * MS_PER_DAY).toISOString();
  }

  /** A calendar date `days` in the past. */
  dateDaysAgo(days: number): string {
    return this.daysAgo(days).slice(0, DATE_LENGTH);
  }

  /** A calendar date `days` in the future. */
  dateDaysAhead(days: number): string {
    return this.daysAhead(days).slice(0, DATE_LENGTH);
  }

  /** An instant `minutes` in the future — for quote and grant expiries. */
  minutesAhead(minutes: number): string {
    return new Date(this.currentMs + minutes * MS_PER_MINUTE).toISOString();
  }
}

/** Length of the `YYYY-MM-DD` prefix of an ISO instant. */
const DATE_LENGTH = 10;
