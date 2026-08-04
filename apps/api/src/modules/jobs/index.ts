/**
 * Public surface of the job platform.
 *
 * Downstream lanes import from here: the queue names to target, the registry to
 * enqueue through, the base processor to consume with, and the dead-letter service
 * for direct parking and replay.
 */
export { BaseJobProcessor, type ProcessorOptions } from './base.processor.js';
export { createBullBoardHandlers, type BullBoardOptions } from './bull-board.middleware.js';
export { DeadLetterService } from './dead-letter.service.js';
export {
  BULL_BOARD_ROUTE,
  DEAD_LETTER_JOB_NAME,
  DEFAULT_JOB_ATTEMPTS,
  JOB_QUEUE,
  JOB_QUEUE_NAMES,
  deadLetterQueueName,
  replayIdOf,
  type JobQueueName,
} from './jobs.constants.js';
export { JobsModule } from './jobs.module.js';
export {
  type DeadLetterEntry,
  type DeadLetterRecord,
  type ParkRequest,
  type QueueOverview,
  type ReplayResult,
  type RetryPolicy,
} from './jobs.types.js';
export { JobQueueRegistry } from './queue.registry.js';
export { JOB_REDIS_CONNECTION, redisOptionsFromUrl } from './redis-connection.js';
