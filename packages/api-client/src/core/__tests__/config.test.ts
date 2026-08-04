/**
 * Configuration defaults and the error type's cross-bundle guard.
 */

import { API_PREFIX, ErrorCode } from '@reliance/contracts';

import { resolveConfig } from '../config.js';
import { documentCookieReader } from '../cookies.js';
import { ApiClientError, transportFailure } from '../errors.js';
import { errorCodeForStatus, HttpStatus, isMutation, HttpMethod } from '../http.js';

describe('resolveConfig', () => {
  it('defaults the prefix to the contract version and the base URL to the origin', () => {
    const config = resolveConfig({ fetch: () => Promise.resolve(new Response()) });

    expect(config.prefix).toBe(API_PREFIX);
    expect(config.baseUrl).toBe('');
  });

  it('validates responses outside production', () => {
    const previous = process.env.NODE_ENV;

    process.env.NODE_ENV = 'development';
    expect(resolveConfig({ fetch: () => Promise.resolve(new Response()) }).validateResponses).toBe(
      true,
    );

    process.env.NODE_ENV = 'production';
    expect(resolveConfig({ fetch: () => Promise.resolve(new Response()) }).validateResponses).toBe(
      false,
    );

    process.env.NODE_ENV = previous;
  });

  it('honours an explicit validation setting whatever the environment says', () => {
    const config = resolveConfig({
      fetch: () => Promise.resolve(new Response()),
      validateResponses: true,
    });

    expect(config.validateResponses).toBe(true);
  });

  it('uses the global fetch when none is supplied', () => {
    expect(resolveConfig().fetch).toEqual(expect.any(Function));
  });

  it('reads no cookies outside a browser', () => {
    expect(documentCookieReader('rb.csrf')).toBeNull();
  });
});

describe('ApiClientError', () => {
  it('narrows on one code and on several', () => {
    const error = new ApiClientError({
      code: ErrorCode.CARD_FROZEN,
      message: 'Card is frozen.',
      status: HttpStatus.CONFLICT,
    });

    expect(error.is(ErrorCode.CARD_FROZEN)).toBe(true);
    expect(error.isAnyOf(ErrorCode.CARD_EXPIRED, ErrorCode.CARD_FROZEN)).toBe(true);
    expect(error.isAnyOf(ErrorCode.NOT_FOUND)).toBe(false);
  });

  it('defaults the optional envelope fields rather than leaving them undefined', () => {
    const error = new ApiClientError({
      code: ErrorCode.NOT_FOUND,
      message: 'Gone.',
      status: HttpStatus.NOT_FOUND,
    });

    expect(error.details).toEqual([]);
    expect(error.traceId).toBe('');
    expect(error.retryAfterSeconds).toBeNull();
    expect(error.at).toBeNull();
  });

  it('recognises a structurally identical error from another bundle copy', () => {
    const foreign = { name: 'ApiClientError', code: ErrorCode.NOT_FOUND, status: 404 };

    expect(ApiClientError.isApiClientError(foreign)).toBe(true);
    expect(ApiClientError.isApiClientError({ name: 'Error' })).toBe(false);
    expect(ApiClientError.isApiClientError(null)).toBe(false);
  });

  it('keeps the original failure as the cause of a transport error', () => {
    const cause = new TypeError('offline');
    const error = transportFailure('/accounts', cause);

    expect(error.cause).toBe(cause);
    expect(error.isTransportFailure).toBe(true);
  });
});

describe('http helpers', () => {
  it('maps unmapped statuses to INTERNAL_ERROR', () => {
    expect(errorCodeForStatus(HttpStatus.NOT_FOUND)).toBe(ErrorCode.NOT_FOUND);
    expect(errorCodeForStatus(HttpStatus.INTERNAL_SERVER_ERROR)).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('treats every verb but GET as a mutation', () => {
    expect(isMutation(HttpMethod.GET)).toBe(false);
    expect(isMutation(HttpMethod.DELETE)).toBe(true);
  });
});
