import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { type ModuleRef, type Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';

import { TRACE_HEADER } from '@reliance/contracts';

import { AuditInterceptor } from '../audit.interceptor.js';
import { type AuditService } from '../audit.service.js';
import { AuditActorType, type AuditActor } from '../audit.types.js';
import { type AuditedOptions } from '../audited.decorator.js';

const OPTIONS: AuditedOptions = { action: 'account.freeze', entity: 'account' };

const ADMIN = { id: 'adm_1', fullName: 'Root', isAdmin: true };

function makeRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    params: { id: 'acc_1' },
    headers: { [TRACE_HEADER]: 'trace-1', 'user-agent': 'jest' },
    ip: '127.0.0.1',
    user: ADMIN,
    ...overrides,
  };
}

function makeContext(request: unknown, options: AuditedOptions | undefined) {
  const handler = () => undefined;
  const reflector = {
    get: jest.fn<AuditedOptions | undefined, []>().mockReturnValue(options),
  } as unknown as Reflector;

  const context = {
    getHandler: () => handler,
    getType: () => 'http' as const,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

function makeInterceptor(overrides: {
  options?: AuditedOptions;
  record?: (input: unknown) => Promise<unknown>;
  loader?: { loadAuditSubject: (id: string) => Promise<Record<string, unknown> | null> } | null;
}) {
  const request = makeRequest();
  // `?? OPTIONS` would be wrong: passing `options: undefined` is how a caller asks for an
  // undecorated handler, and coalescing it back to OPTIONS silently tests the opposite.
  const options = 'options' in overrides ? overrides.options : OPTIONS;
  const { context, reflector } = makeContext(request, options);
  const record = jest.fn(overrides.record ?? (() => Promise.resolve({})));
  const moduleRef = {
    get: jest.fn(() => overrides.loader ?? null),
  } as unknown as ModuleRef;

  const interceptor = new AuditInterceptor(reflector, moduleRef, {
    record,
  } as unknown as AuditService);

  return { interceptor, context, request, record };
}

const handleWith = (payload: unknown): CallHandler => ({ handle: () => of(payload) });

describe('AuditInterceptor', () => {
  it('ignores handlers without the @Audited metadata', async () => {
    const { interceptor, context, record } = makeInterceptor({ options: undefined });

    const result = await lastValueFrom(interceptor.intercept(context, handleWith({ ok: true })));

    expect(result).toEqual({ ok: true });
    expect(record).not.toHaveBeenCalled();
  });

  it('records a diff of the loaded subject around a successful handler', async () => {
    const loader = {
      loadAuditSubject: jest
        .fn<Promise<Record<string, unknown> | null>, [string]>()
        .mockResolvedValueOnce({ status: 'ACTIVE' })
        .mockResolvedValueOnce({ status: 'FROZEN' }),
    };
    const { interceptor, context, record } = makeInterceptor({
      options: { ...OPTIONS, subjectLoader: class DummyLoader {} as never },
      loader,
    });

    await lastValueFrom(interceptor.intercept(context, handleWith({ id: 'acc_1' })));

    expect(loader.loadAuditSubject).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'account.freeze',
        entity: 'account',
        entityId: 'acc_1',
        before: { status: 'ACTIVE' },
        after: { status: 'FROZEN' },
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        traceId: 'trace-1',
      }),
    );
  });

  it('attributes the change to the authenticated admin', async () => {
    const { interceptor, context, record } = makeInterceptor({});

    await lastValueFrom(interceptor.intercept(context, handleWith({ id: 'acc_1' })));

    const actor = (record.mock.calls[0]?.[0] as { actor: AuditActor }).actor;
    expect(actor).toEqual({ type: AuditActorType.ADMIN, id: 'adm_1', name: 'Root' });
  });

  it('attributes to the system actor when the request is unauthenticated', async () => {
    const { interceptor, context, record, request } = makeInterceptor({});
    request.user = undefined;

    await lastValueFrom(interceptor.intercept(context, handleWith({ id: 'acc_1' })));

    const actor = (record.mock.calls[0]?.[0] as { actor: AuditActor }).actor;
    expect(actor.type).toBe(AuditActorType.SYSTEM);
  });

  it('takes the entity id from the response body on a creation', async () => {
    const { interceptor, context, record, request } = makeInterceptor({});
    request.params = {};

    await lastValueFrom(interceptor.intercept(context, handleWith({ id: 'acc_new' })));

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'acc_new' }));
  });

  it('uses the handler payload as the after-snapshot when no loader is configured', async () => {
    const { interceptor, context, record } = makeInterceptor({});

    await lastValueFrom(
      interceptor.intercept(context, handleWith({ id: 'acc_1', status: 'OPEN' })),
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ before: null, after: { id: 'acc_1', status: 'OPEN' } }),
    );
  });

  it('records nothing when the handler rejects — a failed operation changed nothing', async () => {
    const { interceptor, context, record } = makeInterceptor({});
    const failing: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(lastValueFrom(interceptor.intercept(context, failing))).rejects.toThrow('boom');
    expect(record).not.toHaveBeenCalled();
  });

  it('lets the response through when the audit write itself fails', async () => {
    const { interceptor, context } = makeInterceptor({
      record: () => Promise.reject(new Error('mongo down')),
    });

    const result = await lastValueFrom(interceptor.intercept(context, handleWith({ id: 'acc_1' })));

    expect(result).toEqual({ id: 'acc_1' });
  });
});
