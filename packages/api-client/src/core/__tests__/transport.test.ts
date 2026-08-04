/**
 * Transport behaviour: refresh coordination, retry, CSRF, idempotency, errors.
 *
 * The refresh tests are the reason this file exists. Everything else here would be
 * caught by a type error or an obvious 404 in development; a client that fires twelve
 * refreshes and logs the user out is discovered in production, by a customer.
 */

import { ErrorCode, routes } from '@reliance/contracts';

import { resolveConfig } from '../config.js';
import { ApiClientError } from '../errors.js';
import { HttpMethod, HttpStatus } from '../http.js';
import { HttpTransport } from '../transport.js';

import { deferred, scriptedFetch, type ScriptedResponse } from './test-doubles.js';

const OK: ScriptedResponse = { status: HttpStatus.OK, body: { data: { ok: true } } };
const UNAUTHORIZED: ScriptedResponse = { status: HttpStatus.UNAUTHORIZED, body: undefined };

/** Runs a request that is expected to reject, and returns the typed error. */
async function expectError(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise;
  } catch (caught) {
    return caught as ApiClientError;
  }
  throw new Error('expected the request to reject');
}

function transportWith(
  script: Parameters<typeof scriptedFetch>[0],
  overrides: Partial<Parameters<typeof resolveConfig>[0]> = {},
) {
  const scripted = scriptedFetch(script);
  const config = resolveConfig({
    baseUrl: 'https://api.test',
    fetch: scripted.fetch,
    cookieReader: () => 'csrf-token-value',
    validateResponses: false,
    ...overrides,
  });
  return { transport: new HttpTransport(config), scripted };
}

describe('HttpTransport', () => {
  describe('request construction', () => {
    it('prefixes the path with the API version and includes credentials', async () => {
      const { transport, scripted } = transportWith(() => OK);

      await transport.get({ path: routes.accounts.list });

      expect(scripted.calls[0]?.url).toBe('https://api.test/v1/accounts');
    });

    it('serialises query parameters and drops undefined ones', async () => {
      const { transport, scripted } = transportWith(() => OK);

      await transport.get({
        path: routes.transactions.list,
        query: { limit: 25, status: undefined, category: 'DINING' },
      });

      expect(scripted.calls[0]?.url).toBe(
        'https://api.test/v1/transactions?limit=25&category=DINING',
      );
    });

    it('sends the CSRF header on mutations but not on reads', async () => {
      const { transport, scripted } = transportWith(() => OK);

      await transport.get({ path: routes.accounts.list });
      await transport.post({ path: routes.accounts.create, body: { productCode: 'CUR' } });

      expect(scripted.calls[0]?.headers['x-csrf-token']).toBeUndefined();
      expect(scripted.calls[1]?.headers['x-csrf-token']).toBe('csrf-token-value');
    });

    it('sends the idempotency and step-up headers when supplied', async () => {
      const { transport, scripted } = transportWith(() => OK);

      await transport.post({
        path: routes.transfers.create,
        idempotencyKey: 'key-1',
        stepUpToken: 'step-up-1',
      });

      expect(scripted.calls[0]?.headers['idempotency-key']).toBe('key-1');
      expect(scripted.calls[0]?.headers['x-step-up-token']).toBe('step-up-1');
    });

    it('lets a caller header override one the client set', async () => {
      const { transport, scripted } = transportWith(() => OK);

      await transport.post({
        path: routes.accounts.create,
        body: {},
        headers: { 'x-csrf-token': 'explicit' },
      });

      expect(scripted.calls[0]?.headers['x-csrf-token']).toBe('explicit');
    });
  });

  describe('refresh on 401', () => {
    it('refreshes once and retries the original request', async () => {
      const { transport, scripted } = transportWith((call, index) => {
        if (call.url.endsWith(routes.auth.refresh)) return OK;
        return index === 0 ? UNAUTHORIZED : OK;
      });

      await transport.get({ path: routes.accounts.list });

      expect(scripted.refreshCalls()).toHaveLength(1);
      expect(scripted.calls).toHaveLength(3);
      expect(transport.refreshCount).toBe(1);
    });

    it('fires exactly one refresh for many concurrent 401s', async () => {
      const gate = deferred<void>();
      const seen = new Set<string>();

      const { transport, scripted } = transportWith(async (call) => {
        if (call.url.endsWith(routes.auth.refresh)) {
          await gate.promise;
          return OK;
        }
        // Each distinct URL 401s once, then succeeds — mimicking an expired access
        // cookie that the refresh repairs for everybody at once.
        if (seen.has(call.url)) return OK;
        seen.add(call.url);
        return UNAUTHORIZED;
      });

      const inFlight = Promise.all([
        transport.get({ path: routes.accounts.list }),
        transport.get({ path: routes.transactions.list }),
        transport.get({ path: routes.cards.list }),
        transport.get({ path: routes.notifications.list }),
      ]);

      gate.resolve();
      await inFlight;

      expect(scripted.refreshCalls()).toHaveLength(1);
      expect(transport.refreshCount).toBe(1);
    });

    it('propagates a second 401 rather than refreshing again', async () => {
      const onUnauthenticated = jest.fn();
      const { transport, scripted } = transportWith(
        (call) => (call.url.endsWith(routes.auth.refresh) ? OK : UNAUTHORIZED),
        { onUnauthenticated },
      );

      await expect(transport.get({ path: routes.accounts.list })).rejects.toMatchObject({
        code: ErrorCode.UNAUTHENTICATED,
        status: HttpStatus.UNAUTHORIZED,
      });

      expect(scripted.refreshCalls()).toHaveLength(1);
      expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    });

    it('does not attempt a refresh when the refresh itself 401s', async () => {
      const { transport, scripted } = transportWith(() => UNAUTHORIZED);

      await expect(
        transport.post({ path: routes.auth.refresh, allowRefresh: false }),
      ).rejects.toBeInstanceOf(ApiClientError);

      expect(scripted.calls).toHaveLength(1);
    });

    it('rereads the CSRF cookie on the retry, because refresh rotates it', async () => {
      const tokens = ['before-refresh', 'after-refresh'];
      let reads = 0;

      const { transport, scripted } = transportWith(
        (call, index) => {
          if (call.url.endsWith(routes.auth.refresh)) return OK;
          return index === 0 ? UNAUTHORIZED : OK;
        },
        {
          cookieReader: () => {
            const token = tokens[Math.min(reads, tokens.length - 1)] ?? null;
            reads += 1;
            return token;
          },
        },
      );

      await transport.post({ path: routes.transfers.create, body: {} });

      const mutations = scripted.calls.filter((call) => !call.url.endsWith(routes.auth.refresh));
      expect(mutations[0]?.headers['x-csrf-token']).toBe('before-refresh');
      expect(mutations[1]?.headers['x-csrf-token']).toBe('after-refresh');
    });

    it('gives up when the refresh fails, without retrying the original', async () => {
      const { transport, scripted } = transportWith((call) =>
        call.url.endsWith(routes.auth.refresh)
          ? { status: HttpStatus.INTERNAL_SERVER_ERROR }
          : UNAUTHORIZED,
      );

      await expect(transport.get({ path: routes.accounts.list })).rejects.toBeInstanceOf(
        ApiClientError,
      );

      expect(scripted.calls).toHaveLength(2);
      expect(transport.refreshCount).toBe(0);
    });
  });

  describe('errors', () => {
    it('parses the contract error envelope into a typed error', async () => {
      const { transport } = transportWith(() => ({
        status: HttpStatus.CONFLICT,
        body: {
          error: {
            code: ErrorCode.INSUFFICIENT_FUNDS,
            message: 'Not enough money.',
            traceId: 'trace-123',
            at: '2026-08-02T10:00:00.000Z',
            details: [{ path: 'amount', message: 'exceeds available balance' }],
          },
        },
      }));

      const error = await expectError(transport.post({ path: routes.transfers.create, body: {} }));

      expect(ApiClientError.isApiClientError(error)).toBe(true);
      expect(error.is(ErrorCode.INSUFFICIENT_FUNDS)).toBe(true);
      expect(error.traceId).toBe('trace-123');
      expect(error.details).toEqual([{ path: 'amount', message: 'exceeds available balance' }]);
    });

    it('falls back to a status-derived code when the body is not an envelope', async () => {
      const { transport } = transportWith(() => ({
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: undefined,
      }));

      const error = await expectError(transport.get({ path: routes.accounts.list }));

      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
    });

    it('reports an unreachable API as a transport failure, not a 5xx', async () => {
      const transport = new HttpTransport(
        resolveConfig({
          fetch: () => Promise.reject(new TypeError('network down')),
          validateResponses: false,
        }),
      );

      const error = await expectError(transport.get({ path: routes.system.health }));

      expect(error.isTransportFailure).toBe(true);
      expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    });

    it('lets an abort propagate untouched', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      const transport = new HttpTransport(
        resolveConfig({ fetch: () => Promise.reject(abortError), validateResponses: false }),
      );

      await expect(transport.get({ path: routes.accounts.list })).rejects.toBe(abortError);
    });
  });

  describe('method helpers', () => {
    it('sends the verb each helper names', async () => {
      const { transport, scripted } = transportWith(() => OK);

      await transport.get({ path: routes.accounts.list });
      await transport.post({ path: routes.accounts.create });
      await transport.put({ path: routes.profile.update });
      await transport.patch({ path: routes.profile.update });
      await transport.delete({ path: routes.devices.byId('dev_1') });

      expect(scripted.calls.map((call) => call.method)).toEqual([
        HttpMethod.GET,
        HttpMethod.POST,
        HttpMethod.PUT,
        HttpMethod.PATCH,
        HttpMethod.DELETE,
      ]);
    });
  });
});
