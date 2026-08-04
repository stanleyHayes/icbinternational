import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type DefaultJobOptions, type Job, type JobsOptions, Queue } from 'bullmq';
import { type RedisOptions } from 'ioredis';

import {
  COMPLETED_RETENTION_COUNT,
  DEFAULT_BACKOFF_DELAY_MS,
  DEFAULT_JOB_ATTEMPTS,
} from './jobs.constants.js';
import { JOB_REDIS_CONNECTION } from './redis-connection.js';

/** Retry policy every queue inherits; a per-job `JobsOptions` value wins over it. */
const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: DEFAULT_JOB_ATTEMPTS,
  backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_DELAY_MS },
  removeOnComplete: { count: COMPLETED_RETENTION_COUNT },
  // Failed jobs are kept: they are the evidence behind a dead-letter record, and
  // Bull Board's own retry affordance operates on them.
  removeOnFail: false,
};

/**
 * The registry downstream lanes enqueue through.
 *
 * One `Queue` instance per name, created lazily and shared process-wide. Every queue
 * carries the platform retry policy: five attempts with exponential backoff, after
 * which `DeadLetterService` parks the job in the queue's dead-letter companion.
 *
 * Time boundary: BullMQ delays and repeatables run on the **real** wall clock — Redis
 * knows nothing of the bank's simulated clock. A lane that wants "run at business
 * date X" computes a real-time delay from `ClockService` at enqueue time, and the
 * processor re-reads `ClockService` when it runs.
 */
@Injectable()
export class JobQueueRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(JobQueueRegistry.name);
  private readonly queues = new Map<string, Queue>();

  constructor(@Inject(JOB_REDIS_CONNECTION) private readonly connection: RedisOptions) {}

  /** The connection options processors pass to their BullMQ workers. */
  get connectionOptions(): RedisOptions {
    return this.connection;
  }

  /** The shared `Queue` for a name, created on first use. */
  getQueue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queue.on('error', (error: Error) => {
      this.logger.error(`Queue ${name} error: ${error.message}`, error.stack);
    });
    this.queues.set(name, queue);
    return queue;
  }

  /**
   * Enqueues a job. `options` may set `delay`, `repeat`, `jobId`, or override the
   * default `attempts`/`backoff` — e.g. a rail callback that must not retry passes
   * `{ attempts: 1 }` so a failure dead-letters immediately.
   */
  enqueue<TData>(
    queue: string,
    name: string,
    data: TData,
    options?: JobsOptions,
  ): Promise<Job<TData>> {
    return this.getQueue(queue).add(name, data, options) as Promise<Job<TData>>;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map(async (queue) => queue.close()));
    this.queues.clear();
  }
}
