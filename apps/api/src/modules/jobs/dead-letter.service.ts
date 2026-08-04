import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type Job, type JobsOptions, Queue, QueueEvents } from 'bullmq';
import { type RedisOptions } from 'ioredis';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import {
  DEAD_LETTER_JOB_NAME,
  DEAD_LETTER_LIST_LIMIT,
  DEFAULT_JOB_ATTEMPTS,
  JOB_QUEUE_NAMES,
  REPLAY_ID_SEPARATOR,
  deadLetterQueueName,
  replayIdOf,
} from './jobs.constants.js';
import {
  type DeadLetterEntry,
  type DeadLetterRecord,
  type ParkRequest,
  type QueueOverview,
  type ReplayResult,
} from './jobs.types.js';
import { JobQueueRegistry } from './queue.registry.js';
import { JOB_REDIS_CONNECTION } from './redis-connection.js';

/** `jobId` recorded for payloads parked directly rather than after retries. */
const DIRECT_PARK_JOB_ID = 'direct';

/**
 * The dead-letter destination for every queue.
 *
 * Each source queue gets a companion `<queue>-dead` queue with no worker — parked
 * jobs stay put until an operator replays them. A `QueueEvents` listener per watched
 * queue observes `failed`: when a job's attempts are exhausted the job is copied into
 * the DLQ with its payload, failure reason and attempt count, on the business clock.
 *
 * Replay re-enqueues the original payload on the source queue under a fresh id (the
 * platform retry policy applies again) and removes the DLQ entry.
 *
 * Modules can also {@link park} a payload directly, without a queue failure — the
 * audit interceptor uses this for an audit event whose write failed after its
 * mutation committed: the request already succeeded, so the event cannot be retried
 * in-band, and a log line alone would lose it.
 */
@Injectable()
export class DeadLetterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly listeners = new Map<string, QueueEvents>();
  private readonly deadQueues = new Map<string, Queue>();

  constructor(
    private readonly registry: JobQueueRegistry,
    private readonly clock: ClockService,
    @Inject(JOB_REDIS_CONNECTION) private readonly connection: RedisOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(JOB_QUEUE_NAMES.map(async (queue) => this.watch(queue)));
  }

  async onModuleDestroy(): Promise<void> {
    const closers = [...this.listeners.values(), ...this.deadQueues.values()];
    await Promise.all(closers.map(async (closable) => closable.close()));
    this.listeners.clear();
    this.deadQueues.clear();
  }

  /**
   * Attaches the failure listener for a queue. The platform queues are watched at
   * boot; call this for any ad-hoc queue that should also dead-letter.
   */
  async watch(queue: string): Promise<void> {
    if (this.listeners.has(queue)) return;

    const events = new QueueEvents(queue, { connection: this.connection });
    events.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      void this.onJobFailed(queue, jobId, failedReason);
    });
    events.on('error', (error: Error) => {
      this.logger.error(`QueueEvents on ${queue} errored: ${error.message}`, error.stack);
    });
    this.listeners.set(queue, events);
    await events.waitUntilReady();
  }

  /**
   * Parks a payload in a queue's DLQ directly. Returns the replay id. Used both by
   * the retry-exhaustion listener and by modules with an unrecoverable side-effect
   * write (see class docs).
   */
  async park(request: ParkRequest): Promise<string> {
    const record: DeadLetterRecord = {
      queue: request.queue,
      jobId: request.jobId ?? DIRECT_PARK_JOB_ID,
      name: request.name,
      payload: request.payload,
      failedReason: request.reason,
      attemptsMade: request.attemptsMade ?? 0,
      deadLetteredAt: this.clock.now().toISOString(),
      retryPolicy: request.retryPolicy,
    };
    const parked = await this.deadQueue(request.queue).add(DEAD_LETTER_JOB_NAME, record);
    const replayId = replayIdOf(request.queue, parked.id ?? DIRECT_PARK_JOB_ID);
    this.logger.warn(
      `Dead-lettered ${request.queue}/${request.name} as ${replayId}: ${request.reason}`,
    );
    return replayId;
  }

  /** The most recent dead letters for a queue, oldest first, with replay ids. */
  async list(queue: string, limit = DEAD_LETTER_LIST_LIMIT): Promise<DeadLetterEntry[]> {
    const parked = await this.deadQueue(queue).getJobs(
      ['waiting', 'delayed', 'active'],
      0,
      limit - 1,
    );
    return parked.map((job) => toEntry(queue, job));
  }

  /**
   * Replays a dead letter: re-enqueues the original payload on the source queue and
   * removes the DLQ entry. Throws `NOT_FOUND` for an unknown replay id and
   * `VALIDATION_FAILED` for a malformed one.
   */
  async replay(replayId: string): Promise<ReplayResult> {
    const { queue, dlqJobId } = parseReplayId(replayId);
    const parked = await this.deadQueue(queue).getJob(dlqJobId);
    if (!parked) throw AppError.notFound('Dead-letter job', replayId);

    const record = parked.data as DeadLetterRecord;
    const options: JobsOptions = {};
    if (record.retryPolicy?.attempts !== undefined) options.attempts = record.retryPolicy.attempts;
    if (record.retryPolicy?.backoff !== undefined) options.backoff = record.retryPolicy.backoff;
    const job = await this.registry.enqueue(record.queue, record.name, record.payload, options);
    await parked.remove();
    this.logger.log(`Replayed ${replayId} as ${record.queue}/${job.id ?? 'unknown'}`);
    return { queue: record.queue, jobId: job.id ?? '', replayedFrom: replayId };
  }

  /** Counts and recent dead letters for every watched queue — the admin overview. */
  async overview(): Promise<QueueOverview[]> {
    const names = [...JOB_QUEUE_NAMES];
    return Promise.all(
      names.map(async (name) => ({
        name,
        counts: await this.registry.getQueue(name).getJobCounts(),
        deadLetters: await this.list(name),
      })),
    );
  }

  private deadQueue(sourceQueue: string): Queue {
    const name = deadLetterQueueName(sourceQueue);
    const existing = this.deadQueues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, { connection: this.connection });
    queue.on('error', (error: Error) => {
      this.logger.error(`DLQ ${name} error: ${error.message}`, error.stack);
    });
    this.deadQueues.set(name, queue);
    return queue;
  }

  private async onJobFailed(queue: string, jobId: string, failedReason: string): Promise<void> {
    try {
      await this.parkIfExhausted(queue, jobId, failedReason);
    } catch (error) {
      this.logger.error(
        `Failed to dead-letter ${queue}/${jobId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async parkIfExhausted(queue: string, jobId: string, failedReason: string): Promise<void> {
    const job = await this.registry.getQueue(queue).getJob(jobId);
    if (!job) return;

    const budget = job.opts.attempts ?? DEFAULT_JOB_ATTEMPTS;
    if (job.attemptsMade < budget) return;

    await this.park({
      queue,
      jobId,
      name: job.name,
      payload: job.data,
      reason: failedReason,
      attemptsMade: job.attemptsMade,
      retryPolicy: { attempts: job.opts.attempts, backoff: job.opts.backoff },
    });
  }
}

/** A replay id is `<queue>.<dlqJobId>`; the queue name never contains the separator. */
function parseReplayId(replayId: string): { queue: string; dlqJobId: string } {
  const separator = replayId.indexOf(REPLAY_ID_SEPARATOR);
  const queue = separator === -1 ? '' : replayId.slice(0, separator);
  const dlqJobId = separator === -1 ? '' : replayId.slice(separator + 1);
  if (queue === '' || dlqJobId === '') {
    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'A replay id must have the form <queue>.<jobId>',
      details: [{ path: 'id', message: 'Expected <queue>.<jobId>' }],
    });
  }
  return { queue, dlqJobId };
}

function toEntry(queue: string, job: Job): DeadLetterEntry {
  const record = job.data as DeadLetterRecord;
  return { ...record, queue, replayId: replayIdOf(queue, job.id ?? DIRECT_PARK_JOB_ID) };
}
