import { ErrorCode } from '@reliance/contracts';

import { type AppError } from '../../../common/errors/app-error.js';
import { IdempotencyStatus } from '../idempotency-key.schema.js';

import { makeIdempotencyService } from './idempotency-key.fake.js';

const SCOPE = { key: 'key-0000-0001', userId: 'usr_1' };
const HASH = 'hash-a';
const OTHER_HASH = 'hash-b';

const CREATED = 201;

describe('IdempotencyService.begin', () => {
  it('claims an unseen key and tells the caller to execute', async () => {
    const { service, repository } = makeIdempotencyService();

    const outcome = await service.begin({ ...SCOPE, requestHash: HASH });

    expect(outcome).toEqual({ kind: 'EXECUTE' });
    expect(repository.size).toBe(1);
    expect((await repository.find(SCOPE))?.status).toBe(IdempotencyStatus.IN_FLIGHT);
  });

  it('rejects a duplicate that is still in flight', async () => {
    const { service } = makeIdempotencyService();
    await service.begin({ ...SCOPE, requestHash: HASH });

    await expect(service.begin({ ...SCOPE, requestHash: HASH })).rejects.toMatchObject({
      code: ErrorCode.IDEMPOTENT_REQUEST_IN_FLIGHT,
    });
  });

  it('replays the stored response once the first request has completed', async () => {
    const { service } = makeIdempotencyService();
    await service.begin({ ...SCOPE, requestHash: HASH });
    await service.complete({ ...SCOPE, status: CREATED, body: { id: 'trf_1' } });

    const outcome = await service.begin({ ...SCOPE, requestHash: HASH });

    expect(outcome).toEqual({
      kind: 'REPLAY',
      response: { status: CREATED, body: { id: 'trf_1' } },
    });
  });

  it('rejects the same key carrying a different payload', async () => {
    const { service } = makeIdempotencyService();
    await service.begin({ ...SCOPE, requestHash: HASH });
    await service.complete({ ...SCOPE, status: CREATED, body: { id: 'trf_1' } });

    await expect(service.begin({ ...SCOPE, requestHash: OTHER_HASH })).rejects.toMatchObject({
      code: ErrorCode.IDEMPOTENCY_KEY_REUSED,
    });
  });

  it('rejects a mismatched payload even while the first request is still running', async () => {
    const { service } = makeIdempotencyService();
    await service.begin({ ...SCOPE, requestHash: HASH });

    // Payload mismatch outranks in-flight: the client has a bug, and telling it to retry
    // would invite it to keep sending a second, different transfer under the same key.
    await expect(service.begin({ ...SCOPE, requestHash: OTHER_HASH })).rejects.toMatchObject({
      code: ErrorCode.IDEMPOTENCY_KEY_REUSED,
    });
  });

  it('scopes keys per caller, so two customers may pick the same string', async () => {
    const { service } = makeIdempotencyService();

    await service.begin({ ...SCOPE, requestHash: HASH });
    const other = await service.begin({ key: SCOPE.key, userId: 'usr_2', requestHash: HASH });

    expect(other).toEqual({ kind: 'EXECUTE' });
  });

  it('lets a released key be claimed again', async () => {
    const { service, repository } = makeIdempotencyService();
    await service.begin({ ...SCOPE, requestHash: HASH });
    await service.release(SCOPE);

    expect(repository.size).toBe(0);
    await expect(service.begin({ ...SCOPE, requestHash: HASH })).resolves.toEqual({
      kind: 'EXECUTE',
    });
  });

  it('keeps a completed claim when release is called late', async () => {
    const { service } = makeIdempotencyService();
    await service.begin({ ...SCOPE, requestHash: HASH });
    await service.complete({ ...SCOPE, status: CREATED, body: { id: 'trf_1' } });

    // A late release must not delete the stored response a concurrent replay depends on.
    await service.release(SCOPE);

    await expect(service.begin({ ...SCOPE, requestHash: HASH })).resolves.toMatchObject({
      kind: 'REPLAY',
    });
  });

  it('ACCEPTANCE: two concurrent identical claims produce exactly one execution', async () => {
    const { service, repository } = makeIdempotencyService();

    const outcomes = await Promise.allSettled([
      service.begin({ ...SCOPE, requestHash: HASH }),
      service.begin({ ...SCOPE, requestHash: HASH }),
    ]);

    const executed = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled' && outcome.value.kind === 'EXECUTE',
    );
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(executed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(repository.rejectedClaims).toBe(1);

    const error = (rejected[0] as PromiseRejectedResult).reason as AppError;
    expect(error.code).toBe(ErrorCode.IDEMPOTENT_REQUEST_IN_FLIGHT);
  });
});
