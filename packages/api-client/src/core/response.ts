/**
 * Turning a `Response` into either a typed value or an `ApiClientError`.
 *
 * Kept separate from the transport because this is pure: given a response it produces a
 * value or throws, with no knowledge of cookies, refresh or retries. That makes the
 * error-envelope handling — the part callers depend on most — testable without a socket.
 */

import type { ZodType } from 'zod';

import { apiErrorSchema, ErrorCode, type FieldError } from '@reliance/contracts';

import { ApiClientError } from './errors.js';
import { CONTENT_TYPE_HEADER, errorCodeForStatus, HttpStatus, JSON_CONTENT_TYPE } from './http.js';

export interface DecodeOptions<T> {
  readonly response: Response;
  readonly path: string;
  readonly schema?: ZodType<T> | undefined;
  readonly validate: boolean;
}

/** Decodes a successful response, or throws the typed error the envelope describes. */
export async function decodeResponse<T>(options: DecodeOptions<T>): Promise<T> {
  const { response, path, schema, validate } = options;
  const body = await readJsonBody(response);

  if (!response.ok) throw toApiClientError(response, body);
  if (response.status === HttpStatus.NO_CONTENT || body === undefined) return undefined as T;
  if (!validate || !schema) return body as T;

  return validateAgainstContract({ body, schema, path, traceId: traceIdOf(response) });
}

/**
 * Reads the body as JSON, tolerating an empty one.
 *
 * A `204`, a `HEAD`, or a proxy that truncated the body all produce an empty string, and
 * `JSON.parse('')` throws. Returning `undefined` lets the caller decide whether an
 * absent body is legitimate for that status.
 */
async function readJsonBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get(CONTENT_TYPE_HEADER) ?? '';
  const text = await response.text();
  if (text.length === 0) return undefined;
  if (!contentType.includes(JSON_CONTENT_TYPE)) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function traceIdOf(response: Response): string {
  return response.headers.get('x-trace-id') ?? '';
}

/** Parses the contract error envelope, falling back to a status-derived code. */
export function toApiClientError(response: Response, body: unknown): ApiClientError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { error } = parsed.data;
    return new ApiClientError({
      code: error.code,
      message: error.message,
      status: response.status,
      traceId: error.traceId,
      details: error.details,
      retryAfterSeconds: error.retryAfterSeconds,
      at: error.at,
    });
  }

  return new ApiClientError({
    code: errorCodeForStatus(response.status),
    message: fallbackMessage(response, body),
    status: response.status,
    traceId: traceIdOf(response),
  });
}

const MAX_FALLBACK_MESSAGE_LENGTH = 200;

function fallbackMessage(response: Response, body: unknown): string {
  if (typeof body === 'string' && body.trim().length > 0) {
    return body.slice(0, MAX_FALLBACK_MESSAGE_LENGTH);
  }
  return `Request failed with status ${response.status}.`;
}

interface ValidationInput<T> {
  readonly body: unknown;
  readonly schema: ZodType<T>;
  readonly path: string;
  readonly traceId: string;
}

/**
 * Enforces the contract on the way in.
 *
 * A response that does not match its schema is a server defect, not a business
 * rejection, so it surfaces as `INTERNAL_ERROR` — the code every front end already
 * routes to its "something went wrong on our side" state. The Zod issues ride along in
 * `details` so the field that drifted is named in the console rather than guessed at.
 */
function validateAgainstContract<T>(input: ValidationInput<T>): T {
  const result = input.schema.safeParse(input.body);
  if (result.success) return result.data;

  throw new ApiClientError({
    code: ErrorCode.INTERNAL_ERROR,
    message: `Response from ${input.path} does not match the API contract.`,
    status: HttpStatus.OK,
    traceId: input.traceId,
    details: result.error.issues.map(
      (issue): FieldError => ({ path: issue.path.join('.'), message: issue.message }),
    ),
    cause: result.error,
  });
}
