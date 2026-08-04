/**
 * HTTP vocabulary, named once.
 *
 * Status codes and method verbs appear throughout the transport and in the error
 * mapping. Naming them here keeps `no-magic-numbers` honest and, more usefully, makes
 * the one place that maps transport failures onto contract error codes readable.
 */

import { ErrorCode } from '@reliance/contracts';

export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

export const HttpStatus = {
  OK: 200,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;
export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];

/**
 * Synthetic status for a request that never reached the server — DNS failure, offline
 * browser, aborted socket. Zero is not a real HTTP status, which is exactly the point:
 * `status === 0` is an unambiguous "the bank did not answer", distinct from any 5xx it
 * might have answered with.
 */
export const TRANSPORT_FAILURE_STATUS = 0;

export const CONTENT_TYPE_HEADER = 'content-type';
export const JSON_CONTENT_TYPE = 'application/json';

/**
 * Fallback code for a response whose body is not a contract error envelope.
 *
 * The API always sends the envelope, so reaching this table means a proxy, a load
 * balancer or a framework-level handler answered instead — and those know nothing about
 * `ErrorCode`. Mapping by status keeps `catch (e) { switch (e.code) }` working anyway.
 */
const STATUS_TO_ERROR_CODE: ReadonlyMap<number, ErrorCode> = new Map([
  [HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED],
  [HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED],
  [HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN],
  [HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND],
  [HttpStatus.CONFLICT, ErrorCode.CONFLICT],
  [HttpStatus.PRECONDITION_FAILED, ErrorCode.PRECONDITION_FAILED],
  [HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.PAYLOAD_TOO_LARGE],
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.UNSUPPORTED_MEDIA_TYPE],
  [HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED],
  [HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED],
  [HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE],
  [HttpStatus.GATEWAY_TIMEOUT, ErrorCode.SERVICE_UNAVAILABLE],
  [HttpStatus.BAD_GATEWAY, ErrorCode.DEPENDENCY_FAILED],
]);

/** Best-effort `ErrorCode` for a status the API did not describe itself. */
export function errorCodeForStatus(status: number): ErrorCode {
  return STATUS_TO_ERROR_CODE.get(status) ?? ErrorCode.INTERNAL_ERROR;
}

/** True when the method carries a body and needs CSRF and idempotency protection. */
export function isMutation(method: HttpMethod): boolean {
  return method !== HttpMethod.GET;
}
