/**
 * Ordering a queue by urgency.
 *
 * Split out from the SLA cell because these two are arithmetic, not rendering, and they
 * decide which row an analyst works first. Keeping them free of any import means they can
 * be tested directly at a fixed instant, which is the only way to assert a queue's order
 * without the assertion changing tomorrow.
 */

/** Sorts an item with no deadline last, whichever direction the column is sorted. */
const NO_DEADLINE = Number.MAX_SAFE_INTEGER;

/**
 * Milliseconds since the epoch of the deadline, so ascending order is most-urgent-first.
 *
 * Sorting on the rendered text would order "2h left" before "40m left" alphabetically,
 * which is exactly backwards from what an analyst needs.
 */
export function slaSortValue(dueAt: string | null): number {
  if (!dueAt) return NO_DEADLINE;
  const due = new Date(dueAt).getTime();
  return Number.isNaN(due) ? NO_DEADLINE : due;
}

/** True when the deadline has passed. */
export function hasBreached(dueAt: string | null | undefined, nowMs: number): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  return !Number.isNaN(due) && due < nowMs;
}

/** How many of these deadlines have already passed — the figure a queue tile shows. */
export function countBreached(dueDates: readonly (string | null)[], nowMs: number): number {
  return dueDates.filter((due) => hasBreached(due, nowMs)).length;
}
