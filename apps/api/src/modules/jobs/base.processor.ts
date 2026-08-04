import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Job, Worker } from 'bullmq';

import { ErrorCode } from '@reliance/contracts';

import { type ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { DEFAULT_WORKER_CONCURRENCY, type JobQueueName } from './jobs.constants.js';
import { type JobQueueRegistry } from './queue.registry.js';

/** Construction options for a {@link BaseJobProcessor}. */
export interface ProcessorOptions {
  /** The platform queue this processor consumes. */
  readonly queue: JobQueueName;
  /** Jobs processed in parallel. Defaults to {@link DEFAULT_WORKER_CONCURRENCY}. */
  readonly concurrency?: number;
}

/**
 * Base class for every queue consumer in the platform.
 *
 * A downstream lane subclasses this, implements {@link handle}, and registers the
 * subclass as a provider in its own module — nothing else is required for the job to
 * gain retries, exponential backoff and dead-lettering:
 *
 * ```ts
 * @Injectable()
 * export class InterestAccrualProcessor extends BaseJobProcessor<AccrualBatch, AccrualResult> {
 *   constructor(clock: ClockService, queues: JobQueueRegistry, /* …lane deps… *\/) {
 *     super(clock, queues, { queue: JOB_QUEUE.SCHEDULER });
 *   }
 *   protected async handle(job: Job<AccrualBatch, AccrualResult>): Promise<AccrualResult> { … }
 * }
 * ```
 *
 * **The time boundary.** BullMQ schedules on the real wall clock — delays, repeatables
 * and retries fire against real time, because Redis cannot see the bank's simulated
 * clock. Business logic inside {@link handle} must therefore take "now" exclusively
 * from the injected `ClockService`: advancing the business date a month makes a month
 * of business effects, while a job enqueued with `delay` still fires after that many
 * real milliseconds.
 *
 * **Failure semantics.** A handler that throws fails the attempt; BullMQ retries with
 * the queue's backoff, and after the attempt budget `DeadLetterService` parks the job
 * in the queue's DLQ. Throw bullmq's `UnrecoverableError` to skip retries and
 * dead-letter on first failure. Non-`AppError` throws are wrapped so the recorded
 * failure reason is a contract-coded message, never a leaky stack string.
 */
export abstract class BaseJobProcessor<TData = unknown, TResult = unknown>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(this.constructor.name);
  private worker: Worker<TData, TResult> | undefined;

  protected constructor(
    protected readonly clock: ClockService,
    private readonly registry: JobQueueRegistry,
    private readonly options: ProcessorOptions,
  ) {}

  /** Processes one job. Throwing fails the attempt — see the class docs for semantics. */
  protected abstract handle(job: Job<TData, TResult>): Promise<TResult>;

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<TData, TResult>(this.options.queue, async (job) => this.execute(job), {
      connection: this.registry.connectionOptions,
      concurrency: this.options.concurrency ?? DEFAULT_WORKER_CONCURRENCY,
    });
    this.worker.on('error', (error: Error) => {
      this.logger.error(`Worker on ${this.options.queue} errored: ${error.message}`, error.stack);
    });
    await this.worker.waitUntilReady();
    this.logger.log(
      `Consuming ${this.options.queue} (concurrency ${this.worker.opts.concurrency})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  private async execute(job: Job<TData, TResult>): Promise<TResult> {
    try {
      return await this.handle(job);
    } catch (error) {
      const failure = asJobFailure(error);
      this.logger.warn(
        `Job ${this.options.queue}/${job.name} attempt ${job.attemptsMade + 1} failed: ${failure.message}`,
      );
      throw failure;
    }
  }
}

/** Non-`AppError` throws become a coded failure; the original rides along as `cause`. */
function asJobFailure(error: unknown): Error {
  if (error instanceof AppError) return error;
  return new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    message: error instanceof Error ? error.message : 'Job failed without an error message',
    cause: error,
  });
}
