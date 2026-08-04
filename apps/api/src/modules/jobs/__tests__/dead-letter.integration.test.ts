import { Test, type TestingModule } from '@nestjs/testing';
import { Worker } from 'bullmq';
import { type RedisOptions } from 'ioredis';
import { ulid } from 'ulid';

import { ErrorCode } from '@reliance/contracts';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { DeadLetterService } from '../dead-letter.service.js';
import { deadLetterQueueName, replayIdOf } from '../jobs.constants.js';
import { JobsModule } from '../jobs.module.js';
import { type DeadLetterEntry } from '../jobs.types.js';
import { JobQueueRegistry } from '../queue.registry.js';
import { JOB_REDIS_CONNECTION } from '../redis-connection.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://localhost:27317/?replicaSet=rs0';
process.env.MONGODB_DB = 'reliancebank_jobs_test';
process.env.REDIS_URL ??= 'redis://localhost:6579';
process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret-0123456789';
process.env.CSRF_SECRET = 'integration-test-csrf';
process.env.ENCRYPTION_KEY = 'integration-test-encryption-key-012345';

jest.setTimeout(240_000);

const ATTEMPTS = 3;
const BACKOFF_MS = 100;
const POLL_INTERVAL_MS = 150;
const POLL_LIMIT = 120;
const FAILURE_MESSAGE = 'rail timed out';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Polls until the DLQ holds `expected` entries for the queue, or fails the test. */
async function waitForDeadLetters(
  deadLetters: DeadLetterService,
  queue: string,
  expected: number,
): Promise<DeadLetterEntry[]> {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
    const entries = await deadLetters.list(queue);
    if (entries.length === expected) return entries;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`DLQ for ${queue} never reached ${expected} entries`);
}

describe('DeadLetterService (integration, real Redis)', () => {
  const queueName = `ledger-test-${ulid().toLowerCase()}`;
  const payload = { cardId: 'crd_01HZY0TEST', amount: '42.00' };

  let moduleRef: TestingModule;
  let registry: JobQueueRegistry;
  let deadLetters: DeadLetterService;
  let worker: Worker;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, ClockModule, JobsModule],
    }).compile();
    await moduleRef.init();

    registry = moduleRef.get(JobQueueRegistry);
    deadLetters = moduleRef.get(DeadLetterService);
    const connection = moduleRef.get<RedisOptions>(JOB_REDIS_CONNECTION);

    await deadLetters.watch(queueName);
    worker = new Worker(
      queueName,
      async (): Promise<unknown> => {
        throw new Error(FAILURE_MESSAGE);
      },
      { connection, concurrency: 1 },
    );
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close();
    await registry.getQueue(queueName).obliterate({ force: true });
    await registry.getQueue(deadLetterQueueName(queueName)).obliterate({ force: true });
    await registry.getQueue(deadLetterQueueName('audit')).obliterate({ force: true });
    await moduleRef.close();
  });

  it('parks a job in the DLQ after it exhausts its attempts', async () => {
    await registry.enqueue(queueName, 'always-fails', payload, {
      attempts: ATTEMPTS,
      backoff: { type: 'fixed', delay: BACKOFF_MS },
    });

    const entry = (await waitForDeadLetters(deadLetters, queueName, 1))[0]!;

    expect(entry).toMatchObject({
      queue: queueName,
      name: 'always-fails',
      payload,
      attemptsMade: ATTEMPTS,
    });
    expect(entry.failedReason).toContain(FAILURE_MESSAGE);
    expect(entry.deadLetteredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.replayId).toBe(replayIdOf(queueName, entry.replayId.split('.')[1]!));
  });

  it('rejects a malformed replay id with VALIDATION_FAILED', async () => {
    const attempt = deadLetters.replay('not-a-replay-id');
    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('rejects an unknown replay id with NOT_FOUND', async () => {
    const attempt = deadLetters.replay(`${queueName}.999999`);
    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
  });

  it('replays a dead letter back onto its source queue and re-runs it', async () => {
    const parked = (await deadLetters.list(queueName))[0]!;

    const result = await deadLetters.replay(parked.replayId);

    expect(result.queue).toBe(queueName);
    expect(result.jobId).not.toBe('');
    expect(result.replayedFrom).toBe(parked.replayId);

    // The DLQ entry is consumed by the replay.
    expect(await deadLetters.list(queueName)).toHaveLength(0);

    // The re-enqueued job sits on the source queue with the original payload…
    const requeued = await registry.getQueue(queueName).getJob(result.jobId);
    expect(requeued?.data).toEqual(payload);

    // …and the worker picks it up: it fails its budget again and lands back in the
    // DLQ, proving the replayed job genuinely re-ran end to end.
    const again = (await waitForDeadLetters(deadLetters, queueName, 1))[0]!;
    expect(again.jobId).toBe(result.jobId);
    expect(again.attemptsMade).toBe(ATTEMPTS);
  });

  it('parks a payload directly, the audit write-failure use case', async () => {
    const auditPayload = { eventId: 'evt_01HZY0TEST', entity: 'journal_entries' };

    const replayId = await deadLetters.park({
      queue: 'audit',
      name: 'audit-event-write',
      payload: auditPayload,
      reason: 'write failed after the mutation committed',
    });

    const entry = (await waitForDeadLetters(deadLetters, 'audit', 1))[0]!;
    expect(entry.replayId).toBe(replayId);
    expect(entry).toMatchObject({
      queue: 'audit',
      name: 'audit-event-write',
      payload: auditPayload,
    });
  });
});
