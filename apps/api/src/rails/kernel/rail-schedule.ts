/**
 * Cut-off windows, business days and settlement batches.
 *
 * Pure calendar arithmetic. A payment rail does not settle continuously: it settles
 * when a window closes, on a day the network operates. Getting "when does this payment
 * land?" right is a statement about calendars, so it is written as functions of an
 * instant rather than as methods on something that also talks to a queue. Every
 * function takes the instant it reasons about as a parameter — the simulated clock
 * supplies it at the call site, and these functions never read time themselves.
 */

import { type PaymentRailName } from '../ports/payment-rail.types.js';

/** Minutes in one hour; windows are expressed as hour + minute UTC. */
const MINUTES_PER_HOUR = 60;

/** Hours in one day — a window's `hourUtc` must fall below this. */
const HOURS_PER_DAY = 24;

/** Milliseconds in one minute, for window offsets within a day. */
const MS_PER_MINUTE = 60_000;

/** Milliseconds in one day, for day stepping. */
const MS_PER_DAY = 86_400_000;

/** Saturday and Sunday, as `Date.getUTCDay()` reports them. */
const SUNDAY = 0;
const SATURDAY = 6;
const WEEKEND_DAYS: readonly number[] = [SUNDAY, SATURDAY];

/** Upper bound on the business-day scan, so a degenerate schedule cannot loop forever. */
const MAX_SCAN_DAYS = 14;

/** Width of the sequence number inside a batch id, so batch ids sort lexicographically. */
const SEQUENCE_DIGITS = 2;

/** Length of the `YYYY-MM-DD` prefix of an ISO timestamp. */
const ISO_DATE_LENGTH = 10;

/** A daily settlement window: the UTC time of day the network closes a batch. */
export interface CutOffWindow {
  readonly hourUtc: number;
  readonly minuteUtc: number;
}

/**
 * How one rail settles: its windows on each business day, and how many business days
 * after the window closes the beneficiary's bank applies value (the "T+n" lag).
 */
export interface RailSchedule {
  readonly rail: PaymentRailName;
  /** At least one window, ascending within the day. Validated by {@link assertValidSchedule}. */
  readonly windows: readonly CutOffWindow[];
  readonly valueDateLagBusinessDays: number;
}

/** The batch a payment would settle in: its id, its close instant and its value date. */
export interface SettlementSlot {
  readonly batchId: string;
  /** The instant the window closes, on the simulated clock. */
  readonly settleAt: Date;
  /** `YYYY-MM-DD` — settlement day plus the rail's business-day lag. */
  readonly valueDate: string;
}

/**
 * Validates a schedule.
 *
 * @throws {RangeError} On no windows, out-of-range times, unsorted windows or a
 *   negative lag — all configuration defects, which should fail loudly at boot rather
 *   than misroute a payment at noon.
 */
export function assertValidSchedule(schedule: RailSchedule): void {
  if (schedule.windows.length === 0) {
    throw new RangeError(`Schedule for ${schedule.rail} declares no cut-off windows`);
  }
  if (schedule.valueDateLagBusinessDays < 0) {
    throw new RangeError(`Schedule for ${schedule.rail} declares a negative value-date lag`);
  }

  let previousMinuteOfDay = -1;
  for (const window of schedule.windows) {
    const minuteOfDay = window.hourUtc * MINUTES_PER_HOUR + window.minuteUtc;
    const hourInvalid = window.hourUtc < 0 || window.hourUtc >= HOURS_PER_DAY;
    const minuteInvalid = window.minuteUtc < 0 || window.minuteUtc >= MINUTES_PER_HOUR;
    if (hourInvalid || minuteInvalid) {
      throw new RangeError(`Schedule for ${schedule.rail} declares an invalid window time`);
    }
    if (minuteOfDay <= previousMinuteOfDay) {
      throw new RangeError(`Schedule for ${schedule.rail} windows must ascend within the day`);
    }
    previousMinuteOfDay = minuteOfDay;
  }
}

/** Whether the network operates on the day containing `instant` (UTC). */
export function isBusinessDay(instant: Date): boolean {
  return !WEEKEND_DAYS.includes(instant.getUTCDay());
}

/**
 * Whether `at` falls after the last window of its business day — the moment a
 * "same-day" promise can no longer be kept. Always false on non-business days, where
 * no same-day promise existed to break.
 */
export function isPastFinalCutOff(schedule: RailSchedule, at: Date): boolean {
  if (!isBusinessDay(at)) return false;
  const last = schedule.windows[schedule.windows.length - 1];
  return last !== undefined && at.getTime() >= windowInstant(at, last).getTime();
}

/**
 * The first settlement slot closing strictly after `after`.
 *
 * Scans forward day by day: the first window of the next business day whose close is
 * later than `after` wins. The value date then moves forward by the schedule's lag,
 * business days only — an ACH credit settling Friday carries Monday's value date.
 *
 * @throws {RangeError} When no slot is found within {@link MAX_SCAN_DAYS} — impossible
 *   for a valid schedule, so surfacing it means the schedule was never validated.
 */
export function nextSettlementSlot(schedule: RailSchedule, after: Date): SettlementSlot {
  for (let dayOffset = 0; dayOffset < MAX_SCAN_DAYS; dayOffset += 1) {
    const day = new Date(startOfDayUtc(after).getTime() + dayOffset * MS_PER_DAY);
    if (!isBusinessDay(day)) continue;

    const slot = slotOnDay(schedule, day, after);
    if (slot !== null) return slot;
  }

  throw new RangeError(`No settlement window for ${schedule.rail} within ${MAX_SCAN_DAYS} days`);
}

/** The slot on a single business day closing after `after`, or null when the day is done. */
function slotOnDay(schedule: RailSchedule, day: Date, after: Date): SettlementSlot | null {
  for (const [sequence, window] of schedule.windows.entries()) {
    const settleAt = windowInstant(day, window);
    if (settleAt.getTime() <= after.getTime()) continue;

    return {
      batchId: batchId(schedule.rail, day, sequence + 1),
      settleAt,
      valueDate: valueDateOf(day, schedule.valueDateLagBusinessDays),
    };
  }

  return null;
}

/** The instant a window closes on the day containing `day`. */
function windowInstant(day: Date, window: CutOffWindow): Date {
  const midnight = startOfDayUtc(day).getTime();
  const offsetMs = (window.hourUtc * MINUTES_PER_HOUR + window.minuteUtc) * MS_PER_MINUTE;
  return new Date(midnight + offsetMs);
}

/** `BATCH-<RAIL>-<YYYYMMDD>-<NN>` — a clerk can read the day off the id. */
function batchId(rail: PaymentRailName, day: Date, sequence: number): string {
  const yyyymmdd = day.toISOString().slice(0, ISO_DATE_LENGTH).replaceAll('-', '');
  const ordinal = String(sequence).padStart(SEQUENCE_DIGITS, '0');
  return `BATCH-${rail}-${yyyymmdd}-${ordinal}`;
}

/** Settlement day plus `lag` business days, rendered `YYYY-MM-DD`. */
function valueDateOf(settlementDay: Date, lag: number): string {
  let remaining = lag;
  let cursor = settlementDay;

  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
    if (isBusinessDay(cursor)) remaining -= 1;
  }

  return cursor.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Midnight UTC at the start of the day containing `instant`. */
function startOfDayUtc(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}
