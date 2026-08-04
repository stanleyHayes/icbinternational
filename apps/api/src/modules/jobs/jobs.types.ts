/**
 * Shared types for the job platform: the dead-letter record parked in a DLQ, the
 * read models the admin endpoints return, and the replay result.
 *
 * There is no contract DTO for these yet — the frozen contracts carry only the route
 * constants (`/admin/jobs`, `/admin/jobs/:id/replay`). If WS-K formalises wire shapes,
 * these interfaces are the candidates to promote via the Contract Change Protocol.
 */

import { type BackoffOptions } from 'bullmq';

/**
 * The attempt budget and backoff a failed job ran with, captured into its dead-letter
 * record so a replay retries under the policy that produced the failure rather than
 * the queue default.
 */
export interface RetryPolicy {
  readonly attempts?: number;
  readonly backoff?: number | BackoffOptions;
}

/**
 * A job that exhausted its retry budget, parked in the source queue's DLQ.
 *
 * `payload` is the original job data, verbatim — replay re-enqueues exactly this.
 * `deadLetteredAt` is an ISO-8601 instant on the bank's business clock
 * (`ClockService`), not wall-clock time: the record is operational data the audit
 * trail may need to align with business events.
 */
export interface DeadLetterRecord {
  readonly queue: string;
  readonly jobId: string;
  readonly name: string;
  readonly payload: unknown;
  readonly failedReason: string;
  readonly attemptsMade: number;
  readonly deadLetteredAt: string;
  readonly retryPolicy?: RetryPolicy;
}

/** A dead letter as the admin surface sees it: the record plus its replay handle. */
export interface DeadLetterEntry extends DeadLetterRecord {
  /** Opaque id accepted by `POST /admin/jobs/:id/replay` — encodes queue and DLQ job id. */
  readonly replayId: string;
}

/** Per-queue health snapshot for the admin job monitor. */
export interface QueueOverview {
  readonly name: string;
  /** Job state → count, as BullMQ reports it (`waiting`, `active`, `failed`, …). */
  readonly counts: Record<string, number>;
  readonly deadLetters: readonly DeadLetterEntry[];
}

/** The outcome of replaying a dead letter back onto its source queue. */
export interface ReplayResult {
  readonly queue: string;
  /** Id of the freshly enqueued job on the source queue. */
  readonly jobId: string;
  /** The replay id that was consumed. */
  readonly replayedFrom: string;
}

/**
 * A payload a module parks directly, bypassing the retry path.
 *
 * Exists for writes that cannot fail loudly at their origin — the audit interceptor's
 * failed audit-event write is the canonical case: the mutation already committed, so
 * the event cannot be retried in-band and must not be dropped. `jobId` and
 * `attemptsMade` default to `direct` and `0` for such entries.
 */
export interface ParkRequest {
  readonly queue: string;
  readonly name: string;
  readonly payload: unknown;
  readonly reason: string;
  readonly jobId?: string;
  readonly attemptsMade?: number;
  /** Original attempt budget/backoff, captured so replay retries under the same policy. */
  readonly retryPolicy?: RetryPolicy;
}
