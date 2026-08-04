import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import mongoose, { type Connection, type Model } from 'mongoose';
import { from, lastValueFrom, throwError } from 'rxjs';

import { ErrorCode, IDEMPOTENCY_HEADER } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdempotencyKeyRepository } from '../idempotency-key.repository.js';
import {
  IdempotencyKeyDocument,
  IdempotencyKeySchema,
  IdempotencyStatus,
} from '../idempotency-key.schema.js';
import {
  DUPLICATE_KEY_ERROR_CODE,
  IDEMPOTENCY_KEY_COLLECTION,
  IDEMPOTENCY_KEY_TTL_SECONDS,
  IDEMPOTENT_REPLAY_HEADER,
} from '../idempotency.constants.js';
import { IdempotencyInterceptor } from '../idempotency.interceptor.js';
import { IdempotencyService } from '../idempotency.service.js';

/**
 * End-to-end proof of the A-08 acceptance criterion.
 *
 * The unit tests prove the decision procedure against a fake whose claim is atomic by
 * construction; this suite proves it against the thing that actually adjudicates the race
 * — the compound unique index in MongoDB. Specifically: that two concurrent identical
 * "transfers" produce exactly one handler execution and one written journal row, that the
 * replay returns the original stored response, and that a reused key with a different
 * payload is a conflict, all through the real interceptor, service, repository and schema.
 *
 * Needs the local replica set (`pnpm db:up`). When it is not reachable the suite reports
 * a visible skip rather than failing: a developer without the container running should
 * not see a red build for a test that never executed, and CI runs it with the container.
 */

// Generous because this suite shares one single-node replica set with every other
// module's integration tests; a slow write under load is not a broken test.
jest.setTimeout(120_000);

const DEFAULT_URI = 'mongodb://127.0.0.1:27317/reliancebank?replicaSet=rs0';

/** See the audit integration suite: Jest resolves `localhost` to an unreachable `::1`. */
const URI = (process.env.MONGODB_URI ?? DEFAULT_URI).replace('//localhost:', '//127.0.0.1:');

const DB_NAME = 'reliancebank_idempotency_itest';

/** Short, so an absent database reports in seconds instead of hitting the hook timeout. */
const SERVER_SELECTION_TIMEOUT_MS = 5000;

/** Our own ceiling on the whole connect, in case the driver's own never fires. */
const CONNECT_DEADLINE_MS = 8000;

const KEY = 'idem-itest-0001';
const USER_ID = 'usr_itest';
const CREATED = 201;
const CLAIMANTS = 4;

/**
 * How long a "transfer" takes once its claim is won.
 *
 * Long enough that a concurrently-started duplicate is guaranteed to find the claim still
 * in flight; short enough that the suite stays fast. The loser is rejected by the unique
 * index either way — this only decides whether it hears "still running" or "replay".
 */
const HANDLER_HOLD_MS = 150;

/** Scratch collection the fake transfer writes to, standing in for `journal_entries`. */
const JOURNAL_COLLECTION = 'itest_journal_entries';

const UNIQUE_INDEX_NAME = 'idempotency_key_scope';
const TTL_INDEX_NAME = 'idempotency_ttl';

const TRANSFER_BODY = { amountMinor: '10000', currency: 'USD', toAccount: 'acc_002' };

describe('idempotency (integration)', () => {
  let connection: Connection | null = null;
  let model: Model<IdempotencyKeyDocument>;
  let service: IdempotencyService;
  let interceptor: IdempotencyInterceptor;
  let unavailable: string | null = null;

  beforeAll(async () => {
    const pending = mongoose.createConnection(URI, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });

    try {
      connection = await Promise.race([pending.asPromise(), rejectAfter(CONNECT_DEADLINE_MS)]);
    } catch (error) {
      await pending.close().catch(() => undefined);
      unavailable = `${URI} is unreachable — run \`pnpm db:up\` (${describeError(error)})`;
      console.warn(`[idempotency integration] SKIPPING: ${unavailable}`);
      return;
    }

    model = connection.model(IdempotencyKeyDocument.name, IdempotencyKeySchema);
    await model.createIndexes();

    service = new IdempotencyService(new IdempotencyKeyRepository(model), new ClockService());
    // Every handler behaves as `@Idempotent()` here; routing metadata is not under test.
    interceptor = new IdempotencyInterceptor({ get: () => true } as unknown as Reflector, service);
  });

  beforeEach(async () => {
    await connection?.db?.collection(IDEMPOTENCY_KEY_COLLECTION).deleteMany({});
    await connection?.db?.collection(JOURNAL_COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    if (!connection) return;
    await connection.db?.dropDatabase();
    await connection.close();
  });

  /** Runs the body only when the replica set is up, and says so loudly when it is not. */
  function withDatabase(name: string, body: () => Promise<void>): void {
    // Every body below asserts; the rule cannot see through this one level of indirection.
    // eslint-disable-next-line sonarjs/assertions-in-tests
    it(name, async () => {
      if (unavailable) {
        console.warn(`[idempotency integration] skipped "${name}": ${unavailable}`);
        return;
      }
      await body();
    });
  }

  withDatabase(
    'declares the unique scope index and the 24h TTL index, and enforces both',
    async () => {
      const byName = new Map((await model.listIndexes()).map((index) => [index.name, index]));

      expect(byName.get(UNIQUE_INDEX_NAME)).toMatchObject({ unique: true });
      expect(byName.get(TTL_INDEX_NAME)).toMatchObject({
        expireAfterSeconds: IDEMPOTENCY_KEY_TTL_SECONDS,
      });

      const claim = {
        key: KEY,
        userId: USER_ID,
        requestHash: 'hash-itest',
        status: IdempotencyStatus.IN_FLIGHT,
      };
      await model.create(claim);
      await expect(model.create(claim)).rejects.toMatchObject({ code: DUPLICATE_KEY_ERROR_CODE });
    },
  );

  withDatabase('serialises concurrent identical claims to exactly one winner', async () => {
    const claim = { key: KEY, userId: USER_ID, requestHash: 'hash-itest' };
    const outcomes = await Promise.allSettled(
      Array.from({ length: CLAIMANTS }, () => service.begin(claim)),
    );

    const winners = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const losers = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(CLAIMANTS - 1);
    for (const loser of losers) {
      expect((loser as PromiseRejectedResult).reason).toMatchObject({
        code: ErrorCode.IDEMPOTENT_REQUEST_IN_FLIGHT,
      });
    }
    expect(await model.countDocuments()).toBe(1);
  });

  withDatabase(
    'ACCEPTANCE: two concurrent identical transfers produce exactly one journal entry',
    async () => {
      const first = makeContext(KEY, TRANSFER_BODY);
      const second = makeContext(KEY, TRANSFER_BODY);
      const { handler, calls } = transferHandler('trf_itest_1');

      const outcomes = await Promise.allSettled([
        lastValueFrom(interceptor.intercept(first.context, handler)),
        lastValueFrom(interceptor.intercept(second.context, handler)),
      ]);

      expect(calls.count).toBe(1);
      expect(await journal().countDocuments()).toBe(1);

      // The loser never reached the handler: the index rejected its claim while the
      // winner was still writing, so it heard "still in flight — retry for the answer".
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: ErrorCode.IDEMPOTENT_REQUEST_IN_FLIGHT,
      });
    },
  );

  withDatabase(
    'ACCEPTANCE: a replay returns the stored response without re-executing',
    async () => {
      const first = makeContext(KEY, TRANSFER_BODY);
      const firstRun = transferHandler('trf_itest_2');
      const original = await lastValueFrom(interceptor.intercept(first.context, firstRun.handler));

      const second = makeContext(KEY, TRANSFER_BODY);
      const secondRun = transferHandler('trf_itest_2');
      const replayed = await lastValueFrom(
        interceptor.intercept(second.context, secondRun.handler),
      );

      expect(replayed).toEqual(original);
      expect(secondRun.calls.count).toBe(0);
      expect(second.response.statusCode).toBe(CREATED);
      expect(second.response.headers[IDEMPOTENT_REPLAY_HEADER]).toBe('true');
      expect(await journal().countDocuments()).toBe(1);
    },
  );

  withDatabase('ACCEPTANCE: the same key with a different payload is a conflict', async () => {
    const first = makeContext(KEY, TRANSFER_BODY);
    await lastValueFrom(
      interceptor.intercept(first.context, transferHandler('trf_itest_3').handler),
    );

    const second = makeContext(KEY, { ...TRANSFER_BODY, amountMinor: '99999900' });
    const secondRun = transferHandler('trf_itest_3');

    await expect(
      lastValueFrom(interceptor.intercept(second.context, secondRun.handler)),
    ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_REUSED });
    expect(secondRun.calls.count).toBe(0);
    expect(await journal().countDocuments()).toBe(1);
  });

  withDatabase(
    'releases the key when the handler fails, so the legitimate retry executes',
    async () => {
      const failing: CallHandler = { handle: () => throwError(() => new Error('rail down')) };
      await expect(
        lastValueFrom(interceptor.intercept(makeContext(KEY, TRANSFER_BODY).context, failing)),
      ).rejects.toThrow('rail down');
      expect(await model.countDocuments()).toBe(0);

      const retry = transferHandler('trf_itest_4');
      const retried = await lastValueFrom(
        interceptor.intercept(makeContext(KEY, TRANSFER_BODY).context, retry.handler),
      );

      expect(retried).toEqual({ id: 'trf_itest_4' });
      expect(retry.calls.count).toBe(1);
      expect(await model.countDocuments()).toBe(1);
    },
  );

  /** The scratch "ledger": where the fake transfer posts its journal entry. */
  function journal() {
    if (!connection?.db) throw new Error('database unavailable');
    return connection.db.collection(JOURNAL_COLLECTION);
  }

  /** A fake transfer endpoint: holds, posts one journal entry, answers with its id. */
  function transferHandler(reference: string): { handler: CallHandler; calls: { count: number } } {
    const calls = { count: 0 };
    const handler: CallHandler = {
      handle: () => {
        calls.count += 1;
        return from(postJournalEntry(reference));
      },
    };
    return { handler, calls };
  }

  async function postJournalEntry(reference: string): Promise<{ id: string }> {
    await delay(HANDLER_HOLD_MS);
    await journal().insertOne({ reference });
    return { id: reference };
  }

  /** Minimal Express request/response doubles: only what the interceptor touches. */
  function makeContext(key: string, body: unknown) {
    const request = {
      method: 'POST',
      url: '/v1/transfers/internal',
      originalUrl: '/v1/transfers/internal',
      headers: { [IDEMPOTENCY_HEADER]: key },
      body,
      ip: '198.51.100.9',
      user: { id: USER_ID },
    };
    const response = makeResponse();
    const context = {
      getHandler: () => () => undefined,
      getType: () => 'http' as const,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
    return { context, response };
  }
});

function makeResponse() {
  return {
    statusCode: CREATED,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Rejects after `ms`. The timer is unref'd so it can never hold the process open. */
function rejectAfter(ms: number): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error(`no response within ${ms}ms`));
    }, ms).unref();
  });
}
