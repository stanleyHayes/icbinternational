import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';

import { ErrorCode, IDEMPOTENCY_HEADER } from '@reliance/contracts';

import { IDEMPOTENT_REPLAY_HEADER } from '../idempotency.constants.js';
import { IdempotencyInterceptor } from '../idempotency.interceptor.js';
import { type IdempotencyService } from '../idempotency.service.js';

import { makeIdempotencyService } from './idempotency-key.fake.js';

const KEY = 'idem-0000-0001';
const CREATED = 201;

/** Minimal Express response double: only what the interceptor actually touches. */
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

function makeContext(options: { key?: string; body: unknown; decorated?: boolean }) {
  const request = {
    method: 'POST',
    url: '/v1/transfers/internal',
    originalUrl: '/v1/transfers/internal',
    headers: options.key === undefined ? {} : { [IDEMPOTENCY_HEADER]: options.key },
    body: options.body,
    ip: '203.0.113.7',
    user: { id: 'usr_1' },
  };
  const response = makeResponse();

  const reflector = {
    get: () => options.decorated ?? true,
  } as unknown as Reflector;

  const context = {
    getHandler: () => () => undefined,
    getType: () => 'http' as const,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;

  return { context, request, response, reflector };
}

/** Counts executions so "exactly one execution" can be asserted rather than inferred. */
function countingHandler(payload: unknown) {
  const calls = { count: 0 };
  const handler: CallHandler = {
    handle: () => {
      calls.count += 1;
      return of(payload);
    },
  };
  return { handler, calls };
}

describe('IdempotencyInterceptor', () => {
  it('passes an undecorated handler straight through', async () => {
    const { service } = makeIdempotencyService();
    const { context, reflector } = makeContext({ key: undefined, body: {}, decorated: false });
    const interceptor = new IdempotencyInterceptor(reflector, service);
    const { handler, calls } = countingHandler({ ok: true });

    await expect(lastValueFrom(interceptor.intercept(context, handler))).resolves.toEqual({
      ok: true,
    });
    expect(calls.count).toBe(1);
  });

  it('rejects a decorated route with no Idempotency-Key before the handler runs', () => {
    const { service } = makeIdempotencyService();
    const { context, reflector } = makeContext({ key: undefined, body: { amount: '100' } });
    const interceptor = new IdempotencyInterceptor(reflector, service);
    const { handler, calls } = countingHandler({ ok: true });

    expect(() => interceptor.intercept(context, handler)).toThrow(
      expect.objectContaining({ code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED }),
    );
    expect(calls.count).toBe(0);
  });

  it('rejects a malformed key as a validation failure', () => {
    const { service } = makeIdempotencyService();
    const { context, reflector } = makeContext({ key: 'short', body: {} });
    const interceptor = new IdempotencyInterceptor(reflector, service);

    expect(() => interceptor.intercept(context, countingHandler(null).handler)).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }),
    );
  });

  it('executes and stores the response on the first call', async () => {
    const { service, repository } = makeIdempotencyService();
    const { context, reflector } = makeContext({ key: KEY, body: { amount: '100' } });
    const interceptor = new IdempotencyInterceptor(reflector, service);
    const { handler, calls } = countingHandler({ id: 'trf_1' });

    const result = await lastValueFrom(interceptor.intercept(context, handler));

    expect(result).toEqual({ id: 'trf_1' });
    expect(calls.count).toBe(1);
    expect(await repository.find({ key: KEY, userId: 'usr_1' })).toMatchObject({
      status: 'COMPLETED',
      responseStatus: CREATED,
      responseBody: { id: 'trf_1' },
    });
  });

  it('ACCEPTANCE: a replay returns the identical body without re-executing', async () => {
    const { service } = makeIdempotencyService();
    const interceptor = new IdempotencyInterceptor(
      makeContext({ key: KEY, body: { amount: '100' } }).reflector,
      service,
    );

    const first = makeContext({ key: KEY, body: { amount: '100' } });
    const firstRun = countingHandler({ id: 'trf_1' });
    const original = await lastValueFrom(interceptor.intercept(first.context, firstRun.handler));

    const second = makeContext({ key: KEY, body: { amount: '100' } });
    const secondRun = countingHandler({ id: 'trf_SHOULD_NOT_HAPPEN' });
    const replayed = await lastValueFrom(interceptor.intercept(second.context, secondRun.handler));

    expect(replayed).toEqual(original);
    expect(secondRun.calls.count).toBe(0);
    expect(second.response.statusCode).toBe(CREATED);
    expect(second.response.headers[IDEMPOTENT_REPLAY_HEADER]).toBe('true');
  });

  it('ACCEPTANCE: the same key with a different payload is rejected', async () => {
    const { service } = makeIdempotencyService();
    const first = makeContext({ key: KEY, body: { amount: '100' } });
    const interceptor = new IdempotencyInterceptor(first.reflector, service);
    await lastValueFrom(
      interceptor.intercept(first.context, countingHandler({ id: 'trf_1' }).handler),
    );

    const second = makeContext({ key: KEY, body: { amount: '999999' } });
    const secondRun = countingHandler({ id: 'trf_2' });

    await expect(
      lastValueFrom(interceptor.intercept(second.context, secondRun.handler)),
    ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_REUSED });
    expect(secondRun.calls.count).toBe(0);
  });

  it('ACCEPTANCE: two concurrent identical requests produce exactly one execution', async () => {
    const { service } = makeIdempotencyService();
    const shared = { count: 0 };

    // One handler instance shared by both requests, so the counter measures executions
    // rather than handler objects. The fake repository's claim is atomic with respect to
    // the event loop, exactly as the unique index is with respect to the server.
    const gated: CallHandler = {
      handle: () => {
        shared.count += 1;
        return of({ id: 'trf_1' });
      },
    };

    const a = makeContext({ key: KEY, body: { amount: '100' } });
    const b = makeContext({ key: KEY, body: { amount: '100' } });
    const interceptor = new IdempotencyInterceptor(a.reflector, service);

    const outcomes = await Promise.allSettled([
      lastValueFrom(interceptor.intercept(a.context, gated)),
      lastValueFrom(interceptor.intercept(b.context, gated)),
    ]);

    expect(shared.count).toBe(1);
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: ErrorCode.IDEMPOTENT_REQUEST_IN_FLIGHT,
    });
  });

  it('ACCEPTANCE: a handler that throws releases the key so the client can retry', async () => {
    const { service, repository } = makeIdempotencyService();
    const first = makeContext({ key: KEY, body: { amount: '100' } });
    const interceptor = new IdempotencyInterceptor(first.reflector, service);
    const failing: CallHandler = { handle: () => throwError(() => new Error('rail down')) };

    await expect(lastValueFrom(interceptor.intercept(first.context, failing))).rejects.toThrow(
      'rail down',
    );
    expect(repository.size).toBe(0);

    // The legitimate retry now goes through.
    const retry = makeContext({ key: KEY, body: { amount: '100' } });
    const retryRun = countingHandler({ id: 'trf_1' });

    await expect(
      lastValueFrom(interceptor.intercept(retry.context, retryRun.handler)),
    ).resolves.toEqual({ id: 'trf_1' });
    expect(retryRun.calls.count).toBe(1);
  });

  it('re-throws the original error even when releasing the key fails', async () => {
    const { service } = makeIdempotencyService();
    jest.spyOn(service, 'release').mockRejectedValue(new Error('mongo down'));

    const { context, reflector } = makeContext({ key: KEY, body: {} });
    const interceptor = new IdempotencyInterceptor(reflector, service as IdempotencyService);
    const failing: CallHandler = { handle: () => throwError(() => new Error('rail down')) };

    // The caller's problem is the rail, not our storage; masking it would hide the cause.
    await expect(lastValueFrom(interceptor.intercept(context, failing))).rejects.toThrow(
      'rail down',
    );
  });
});
