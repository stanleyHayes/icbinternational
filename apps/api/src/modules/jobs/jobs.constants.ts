/**
 * Shared policy for the scheduled-task platform.
 *
 * Each lane owns its own cadence constant (fees, fx, mandates, …) — what lives here is only
 * what every task shares. The queue topology, retry/backoff policy and dead-letter surface
 * that used to live here went with Redis; see `BaseScheduledTask` for what replaced them.
 */

/** How many due records a sweep claims in one pass, so a backlog cannot monopolise a tick. */
export const DEFAULT_SWEEP_BATCH_SIZE = 100;
