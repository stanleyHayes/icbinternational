/**
 * The handler vocabulary.
 *
 * Handlers are declared as plain descriptors — method, path pattern, resolver — and only
 * turned into MSW handlers by `msw-adapter.ts`. Three things fall out of that:
 *
 * - the route-coverage test can walk the descriptors without booting a service worker;
 * - a resolver is an ordinary function, so it can be unit-tested with a plain object;
 * - swapping MSW for anything else touches one file.
 */

import { API_PREFIX, ErrorCode, type ErrorCode as ErrorCodeType } from '@reliance/contracts';

import { db } from '../db/database.js';
import type { MockDatabase } from '../db/types.js';
import { opaqueId } from '../faker.js';

/** Verbs the mock API answers. */
export const MockMethod = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
} as const;
/** A mock HTTP verb. */
export type MockMethod = (typeof MockMethod)[keyof typeof MockMethod];

/** Everything a resolver is given. */
export interface MockContext {
  /** Path parameters, e.g. `{ id: 'acc_01J…' }`. */
  readonly params: Record<string, string>;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  /** Parsed JSON body, or `undefined` when the request had none. */
  readonly body: unknown;
  readonly db: MockDatabase;
}

/** What a resolver answers with. */
export interface MockResult {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

/** A resolver. */
export type MockResolver = (context: MockContext) => MockResult | Promise<MockResult>;

/** One registered route. */
export interface MockRoute {
  readonly method: MockMethod;
  /** MSW path pattern: a leading `*` for any origin, then `/v1/accounts/:id`. */
  readonly path: string;
  /** The contract route this implements, for the coverage test's error messages. */
  readonly contractPath: string;
  readonly resolve: MockResolver;
}

/** Status codes the mock API uses. */
export const Status = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
} as const;

/**
 * Turns a contract path into the pattern MSW matches on.
 *
 * The leading `*` lets the same handler serve `http://localhost:3000/v1/...` in the
 * browser and `https://api.reliance.test/v1/...` in a server test, so a UI lane never
 * has to configure a base URL twice.
 */
export function pattern(contractPath: string): string {
  return `*${API_PREFIX}${contractPath}`;
}

/** Declares a route. */
export function route(method: MockMethod, contractPath: string, resolve: MockResolver): MockRoute {
  return { method, path: pattern(contractPath), contractPath, resolve };
}

// --- Responses ------------------------------------------------------------

/** A single-resource envelope. */
export function resourceOk<T>(data: T): MockResult {
  return { status: Status.OK, body: { data } };
}

/** A single-resource envelope with a 201. */
export function resourceCreated<T>(data: T): MockResult {
  return { status: Status.CREATED, body: { data } };
}

/** The acknowledgement envelope. */
export function acknowledged(): MockResult {
  return { status: Status.OK, body: { data: { acknowledged: true } } };
}

/** A raw body, for the routes that do not use the contract envelope. */
export function raw(body: unknown, status: number = Status.OK): MockResult {
  return { status, body };
}

/**
 * The contract error envelope.
 *
 * Mocks return real error shapes, not bare 500s. A UI lane that never sees a
 * well-formed `INSUFFICIENT_FUNDS` will not have an error state for it, and the first
 * time anyone finds out is against the real API.
 */
export function failure(
  code: ErrorCodeType,
  message: string,
  options: { status?: number; details?: { path: string; message: string }[] } = {},
): MockResult {
  return {
    status: options.status ?? statusForCode(code),
    body: {
      error: {
        code,
        message,
        details: options.details,
        traceId: opaqueId(),
        at: db().clock.nowIso(),
      },
    },
  };
}

/** Shorthand for the commonest failure. */
export function notFound(what: string): MockResult {
  return failure(ErrorCode.NOT_FOUND, `${what} was not found.`);
}

const CODE_STATUS: ReadonlyMap<ErrorCodeType, number> = new Map([
  [ErrorCode.VALIDATION_FAILED, Status.BAD_REQUEST],
  [ErrorCode.UNAUTHENTICATED, Status.UNAUTHORIZED],
  [ErrorCode.STEP_UP_REQUIRED, Status.FORBIDDEN],
  [ErrorCode.FORBIDDEN, Status.FORBIDDEN],
  [ErrorCode.NOT_FOUND, Status.NOT_FOUND],
  [ErrorCode.ACCOUNT_NOT_FOUND, Status.NOT_FOUND],
  [ErrorCode.CARD_NOT_FOUND, Status.NOT_FOUND],
  [ErrorCode.LOAN_NOT_FOUND, Status.NOT_FOUND],
  [ErrorCode.BENEFICIARY_NOT_FOUND, Status.NOT_FOUND],
  [ErrorCode.QUOTE_NOT_FOUND, Status.NOT_FOUND],
  [ErrorCode.CONFLICT, Status.CONFLICT],
  [ErrorCode.RATE_LIMITED, Status.TOO_MANY_REQUESTS],
  [ErrorCode.IDEMPOTENCY_KEY_REQUIRED, Status.BAD_REQUEST],
]);

function statusForCode(code: ErrorCodeType): number {
  return CODE_STATUS.get(code) ?? Status.CONFLICT;
}
