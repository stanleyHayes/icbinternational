import { Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Job } from 'bullmq';
import { ulid } from 'ulid';

import { ErrorCode } from '@reliance/contracts';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { BaseJobProcessor } from '../base.processor.js';
import { DeadLetterService } from '../dead-letter.service.js';
import { deadLetterQueueName, type JobQueueName } from '../jobs.constants.js';
import { JobsModule } from '../jobs.module.js';
import { JobQueueRegistry } from '../queue.registry.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://localhost:27317/?replicaSet=rs0';
process.env.MONGODB_DB = 'reliancebank_jobs_processor_test';
process.env.REDIS_URL ??= 'redis://localhost:6579';
process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret-0123456789';
process.env.CSRF_SECRET = 'integration-test-csrf';
process.env.ENCRYPTION_KEY = 'integration-test-encryption-key-012345';

jest.setTimeout(240_000);

const POLL_INTERVAL_MS = 150;
const POLL_LIMIT = 120;
const ATTEMPTS = 2;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface CodedPayload {
  readonly accountId: string;
}

const PROCESSOR_TEST_QUEUE = `scheduler-test-${ulid().toLowerCase()}` as JobQueueName;

/** A failing consumer written the way a downstream lane writes one: subclass + register. */
@Injectable()
class AlwaysFailsProcessor extends BaseJobProcessor<CodedPayload, never> {
  readonly seenAttempts: number[] = [];

  constructor(clock: ClockService, queues: JobQueueRegistry) {
    super(clock, queues, { queue: PROCESSOR_TEST_QUEUE, concurrency: 1 });
  }

  protected handle(job: Job<CodedPayload, never>): Promise<never> {
    this.seenAttempts.push(job.attemptsMade);
    return Promise.reject(
      new AppError({ code: ErrorCode.RAIL_UNAVAILABLE, message: 'The rail is unavailable' }),
    );
  }
}

@Module({
  imports: [AppConfigModule, ClockModule, JobsModule],
  providers: [AlwaysFailsProcessor],
})
class ProcessorTestModule {}

describe('BaseJobProcessor (integration, real Redis)', () => {
  let moduleRef: TestingModule;
  let registry: JobQueueRegistry;
  let deadLetters: DeadLetterService;
  let processor: AlwaysFailsProcessor;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [ProcessorTestModule] }).compile();
    await moduleRef.init();

    registry = moduleRef.get(JobQueueRegistry);
    deadLetters = moduleRef.get(DeadLetterService);
    processor = moduleRef.get(AlwaysFailsProcessor);
    await deadLetters.watch(PROCESSOR_TEST_QUEUE);
  });

  afterAll(async () => {
    await registry.getQueue(PROCESSOR_TEST_QUEUE).obliterate({ force: true });
    await registry.getQueue(deadLetterQueueName(PROCESSOR_TEST_QUEUE)).obliterate({ force: true });
    await moduleRef.close();
  });

  it('runs a subclassed processor and dead-letters with the AppError reason intact', async () => {
    await registry.enqueue(
      PROCESSOR_TEST_QUEUE,
      'accrual-batch',
      { accountId: 'acc_01HZY0TEST' },
      { attempts: ATTEMPTS, backoff: { type: 'fixed', delay: 100 } },
    );

    let parked: Awaited<ReturnType<DeadLetterService['list']>> = [];
    for (let poll = 0; poll < POLL_LIMIT && parked.length === 0; poll += 1) {
      parked = await deadLetters.list(PROCESSOR_TEST_QUEUE);
      if (parked.length === 0) await sleep(POLL_INTERVAL_MS);
    }

    // The base class built and started a real worker that consumed every attempt.
    expect(processor.seenAttempts).toEqual([0, 1]);

    // The AppError message — not a stack string — is what the DLQ records.
    expect(parked[0]?.failedReason).toBe('The rail is unavailable');
    expect(parked[0]?.attemptsMade).toBe(ATTEMPTS);
    expect(parked[0]?.payload).toEqual({ accountId: 'acc_01HZY0TEST' });
  });
});
