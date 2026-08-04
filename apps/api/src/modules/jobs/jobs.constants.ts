/**
 * Queue topology and retry policy for the job platform.
 *
 * The five queues are the platform's fixed surface: downstream lanes (interest,
 * statements, notifications, rails, AML) register processors into one of them rather
 * than inventing new queues, so operational tooling — Bull Board, the DLQ, the admin
 * job monitor — sees everything in one known set.
 */

/** The platform's queues. `scheduler` is the clock-driven lane (interest, statements, standing orders). */
export const JOB_QUEUE = {
  LEDGER: 'ledger',
  NOTIFICATIONS: 'notifications',
  DOCUMENTS: 'documents',
  RAILS: 'rails',
  SCHEDULER: 'scheduler',
} as const;

/** A platform queue name. */
export type JobQueueName = (typeof JOB_QUEUE)[keyof typeof JOB_QUEUE];

/** All platform queue names, for wiring listeners and dashboards. */
export const JOB_QUEUE_NAMES: readonly JobQueueName[] = Object.values(JOB_QUEUE);

/** Suffix marking a queue's dead-letter companion, e.g. `ledger-dead`. */
export const DEAD_LETTER_SUFFIX = '-dead';

/** Job name under which dead-lettered payloads are parked in the DLQ. */
export const DEAD_LETTER_JOB_NAME = 'dead-letter';

/** Separator between queue name and DLQ job id in a replay id (`ledger.42`). */
export const REPLAY_ID_SEPARATOR = '.';

/** Default attempts before a failing job is dead-lettered. Per-job `attempts` overrides this. */
export const DEFAULT_JOB_ATTEMPTS = 5;

/** First retry delay; each subsequent attempt doubles it (exponential backoff). */
export const DEFAULT_BACKOFF_DELAY_MS = 1_000;

/** Completed jobs are retained up to this count per queue, then trimmed by BullMQ. */
export const COMPLETED_RETENTION_COUNT = 1_000;

/** Dead letters listed by the admin endpoint per queue. The DLQ itself is never trimmed. */
export const DEAD_LETTER_LIST_LIMIT = 50;

/** Worker concurrency when a processor does not declare its own. */
export const DEFAULT_WORKER_CONCURRENCY = 5;

/** Path the Bull Board UI is mounted on, relative to the API prefix (`/v1/admin/queues`). */
export const BULL_BOARD_ROUTE = 'admin/queues';

/** Default Redis port when the URL omits one. */
export const DEFAULT_REDIS_PORT = 6379;

/** The dead-letter queue name for a source queue. */
export function deadLetterQueueName(queue: string): string {
  return `${queue}${DEAD_LETTER_SUFFIX}`;
}

/** The replay id for a parked dead letter: `<queue>.<dlqJobId>`. */
export function replayIdOf(queue: string, dlqJobId: string): string {
  return `${queue}${REPLAY_ID_SEPARATOR}${dlqJobId}`;
}
