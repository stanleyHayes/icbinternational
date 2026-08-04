import { Injectable, Logger } from '@nestjs/common';

/**
 * The only source of "now" in the application.
 *
 * Reliance Bank runs on a clock the operations console can move. Advancing it by a month
 * must produce a month of interest accrual, statements, standing orders and arrears — and
 * that only works if every service reads the time from here. `new Date()` and `Date.now()`
 * are banned in `apps/api/src` by the `reliance/no-ambient-clock` lint rule; this file is
 * the single, deliberate exception.
 */
@Injectable()
export class ClockService {
  private readonly logger = new Logger(ClockService.name);

  /** Milliseconds added to wall-clock time. Mutated only by the simulation module. */
  private offsetMs = 0;

  /** When set, time is pinned to this instant regardless of the wall clock. */
  private frozenAt: Date | null = null;

  /** Current time as the application understands it. */
  now(): Date {
    if (this.frozenAt) return new Date(this.frozenAt.getTime());
    return new Date(this.realNow().getTime() + this.offsetMs);
  }

  /** Current time as epoch milliseconds. */
  timestamp(): number {
    return this.now().getTime();
  }

  /** True wall-clock time. Used only for latency measurement and log timestamps. */
  realNow(): Date {
    return new Date();
  }

  get offsetSeconds(): number {
    return Math.floor(this.offsetMs / MILLISECONDS_PER_SECOND);
  }

  get isFrozen(): boolean {
    return this.frozenAt !== null;
  }

  /** Moves the simulated clock forward. Negative values are refused — time is a ratchet. */
  advance(milliseconds: number): Date {
    if (milliseconds < 0) {
      throw new RangeError('The simulated clock cannot move backwards. Restore a snapshot.');
    }

    if (this.frozenAt) {
      this.frozenAt = new Date(this.frozenAt.getTime() + milliseconds);
    } else {
      this.offsetMs += milliseconds;
    }

    const now = this.now();
    this.logger.warn(`Simulated clock advanced to ${now.toISOString()}`);
    return now;
  }

  /** Pins time so a test or scenario sees a stable instant. */
  freezeAt(instant: Date): void {
    this.frozenAt = new Date(instant.getTime());
    this.logger.warn(`Simulated clock frozen at ${this.frozenAt.toISOString()}`);
  }

  unfreeze(): void {
    if (!this.frozenAt) return;
    this.offsetMs = this.frozenAt.getTime() - this.realNow().getTime();
    this.frozenAt = null;
  }

  /** Returns the clock to real time. */
  reset(): void {
    this.offsetMs = 0;
    this.frozenAt = null;
    this.logger.warn('Simulated clock reset to real time');
  }

  // --- Convenience derivations ------------------------------------------

  /** An instant `seconds` in the future, on the simulated clock. */
  inSeconds(seconds: number): Date {
    return new Date(this.timestamp() + seconds * MILLISECONDS_PER_SECOND);
  }

  inMinutes(minutes: number): Date {
    return this.inSeconds(minutes * SECONDS_PER_MINUTE);
  }

  inHours(hours: number): Date {
    return this.inMinutes(hours * MINUTES_PER_HOUR);
  }

  inDays(days: number): Date {
    return this.inHours(days * HOURS_PER_DAY);
  }

  /** Start of the current simulated day, UTC. Value dates are day-granular. */
  startOfDay(): Date {
    const now = this.now();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /** `YYYY-MM-DD` for the simulated day, the wire format for a value date. */
  today(): string {
    return this.now().toISOString().slice(0, ISO_DATE_LENGTH);
  }
}

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const ISO_DATE_LENGTH = 10;
