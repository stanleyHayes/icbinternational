/**
 * Response decoding: envelopes, empty bodies and contract validation.
 */

import { z } from 'zod';

import { acknowledgedSchema, ErrorCode } from '@reliance/contracts';

import { ApiClientError } from '../errors.js';
import { CONTENT_TYPE_HEADER, HttpStatus, JSON_CONTENT_TYPE } from '../http.js';
import { decodeResponse } from '../response.js';

const PATH = '/accounts';

function jsonResponse(body: unknown, status: HttpStatus = HttpStatus.OK): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE },
  });
}

describe('decodeResponse', () => {
  it('returns the parsed body when validation is off', async () => {
    const result = await decodeResponse({
      response: jsonResponse({ data: { acknowledged: true } }),
      path: PATH,
      validate: false,
    });

    expect(result).toEqual({ data: { acknowledged: true } });
  });

  it('returns undefined for a 204', async () => {
    const result = await decodeResponse({
      response: new Response(null, { status: HttpStatus.NO_CONTENT }),
      path: PATH,
      validate: true,
      schema: acknowledgedSchema,
    });

    expect(result).toBeUndefined();
  });

  it('validates against the contract schema when validation is on', async () => {
    const result = await decodeResponse({
      response: jsonResponse({ data: { acknowledged: true } }),
      path: PATH,
      validate: true,
      schema: acknowledgedSchema,
    });

    expect(result).toEqual({ data: { acknowledged: true } });
  });

  it('reports contract drift as INTERNAL_ERROR with the offending field named', async () => {
    const schema = z.object({ data: z.object({ balance: z.string() }) });

    const error = (await decodeResponse({
      response: jsonResponse({ data: { balance: 12.5 } }),
      path: PATH,
      validate: true,
      schema,
    }).catch((caught: unknown) => caught)) as ApiClientError;

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.details[0]?.path).toBe('data.balance');
  });

  it('skips validation entirely when it is switched off', async () => {
    const schema = z.object({ data: z.object({ balance: z.string() }) });

    const result = await decodeResponse({
      response: jsonResponse({ data: { balance: 12.5 } }),
      path: PATH,
      validate: false,
      schema,
    });

    expect(result).toEqual({ data: { balance: 12.5 } });
  });

  it('surfaces a non-JSON error body as the message', async () => {
    const response = new Response('Gateway timed out', {
      status: HttpStatus.GATEWAY_TIMEOUT,
      headers: { [CONTENT_TYPE_HEADER]: 'text/plain' },
    });

    const error = (await decodeResponse({ response, path: PATH, validate: true }).catch(
      (caught: unknown) => caught,
    )) as ApiClientError;

    expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(error.message).toBe('Gateway timed out');
  });

  it('carries retryAfterSeconds through from the envelope', async () => {
    const response = jsonResponse(
      {
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Slow down.',
          traceId: 'trace-9',
          at: '2026-08-02T10:00:00.000Z',
          retryAfterSeconds: 30,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    const error = (await decodeResponse({ response, path: PATH, validate: true }).catch(
      (caught: unknown) => caught,
    )) as ApiClientError;

    expect(error.retryAfterSeconds).toBe(30);
  });
});
