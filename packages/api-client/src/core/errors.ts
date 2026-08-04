/**
 * The single error type every client call can reject with.
 *
 * There is deliberately one class rather than a hierarchy of `NotFoundError`,
 * `RateLimitedError` and so on. Callers discriminate on `code`, which the contract
 * already enumerates exhaustively; a parallel hierarchy of classes would be a second,
 * weaker copy of that enumeration that has to be kept in step by hand.
 */

import { ErrorCode, type FieldError } from '@reliance/contracts';

import { TRANSPORT_FAILURE_STATUS } from './http.js';

export interface ApiClientErrorInit {
  readonly code: ErrorCode;
  readonly message: string;
  readonly status: number;
  readonly traceId?: string | undefined;
  readonly details?: readonly FieldError[] | undefined;
  readonly retryAfterSeconds?: number | undefined;
  readonly at?: string | undefined;
  readonly cause?: unknown;
}

/** A rejected API call, carrying the contract error envelope in typed form. */
export class ApiClientError extends Error {
  /** The contract code. Switch on this; never on `message`. */
  readonly code: ErrorCode;

  /** HTTP status, or {@link TRANSPORT_FAILURE_STATUS} when no response arrived. */
  readonly status: number;

  /** Field-level failures for `VALIDATION_FAILED`; rule detail otherwise. */
  readonly details: readonly FieldError[];

  /**
   * Correlates the failure with server logs. Empty only for transport failures, which
   * by definition never got far enough for the server to mint one.
   */
  readonly traceId: string;

  /** Present on `RATE_LIMITED` and transient rail failures. */
  readonly retryAfterSeconds: number | null;

  /** Server timestamp of the failure, when the envelope carried one. */
  readonly at: string | null;

  constructor(init: ApiClientErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'ApiClientError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? [];
    this.traceId = init.traceId ?? '';
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.at = init.at ?? null;
  }

  /** Narrow on a specific contract code, e.g. `if (error.is('INSUFFICIENT_FUNDS'))`. */
  is(code: ErrorCode): boolean {
    return this.code === code;
  }

  /** True when any of the supplied codes matches. */
  isAnyOf(...codes: readonly ErrorCode[]): boolean {
    return codes.includes(this.code);
  }

  /** True when the request never reached the API. */
  get isTransportFailure(): boolean {
    return this.status === TRANSPORT_FAILURE_STATUS;
  }

  /**
   * Type guard usable across bundle boundaries.
   *
   * `instanceof` is unreliable when a monorepo ends up with two copies of this module
   * on the same page, so the guard checks the shape rather than the prototype chain.
   */
  static isApiClientError(value: unknown): value is ApiClientError {
    return value instanceof ApiClientError || isApiClientErrorShape(value);
  }
}

function isApiClientErrorShape(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { name?: unknown; code?: unknown; status?: unknown };
  return (
    candidate.name === 'ApiClientError' &&
    typeof candidate.code === 'string' &&
    typeof candidate.status === 'number'
  );
}

/** Builds the error for a request that never reached the API. */
export function transportFailure(path: string, cause: unknown): ApiClientError {
  return new ApiClientError({
    code: ErrorCode.SERVICE_UNAVAILABLE,
    message: `Could not reach the Reliance Bank API (${path}).`,
    status: TRANSPORT_FAILURE_STATUS,
    cause,
  });
}
