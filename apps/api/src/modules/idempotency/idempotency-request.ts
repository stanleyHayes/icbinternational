import { type Request } from 'express';

import { ErrorCode, IDEMPOTENCY_HEADER } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import {
  ANONYMOUS_SCOPE_PREFIX,
  IDEMPOTENCY_KEY_PATTERN,
  MAX_KEY_LENGTH,
  MIN_KEY_LENGTH,
  UNKNOWN_CALLER_SCOPE,
} from './idempotency.constants.js';

/**
 * Reading the key and the caller scope off an Express request.
 *
 * Isolated from the interceptor because it encodes one assumption worth stating: **the
 * auth layer (A-04) attaches the caller to `request.user`.** Until it does, requests are
 * scoped by client address, which still prevents two callers from colliding on the same
 * key string — it just gives a weaker identity than a user id does.
 */

/** The shape A-04 is expected to attach. Structural, so neither module imports the other. */
export interface IdentifiedUser {
  readonly id: string;
}

export type IdempotentRequest = Request & { user?: IdentifiedUser };

/**
 * Extracts the `Idempotency-Key` header.
 *
 * A missing key is `IDEMPOTENCY_KEY_REQUIRED` — a distinct code, because the client's fix
 * is to start sending one, not to correct a field. A malformed key is ordinary validation:
 * it was sent, it is just not usable as half of a unique index.
 */
export function readIdempotencyKey(request: IdempotentRequest): string {
  const header = request.headers[IDEMPOTENCY_HEADER];
  const key = Array.isArray(header) ? header[0] : header;

  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new AppError({
      code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      message:
        `This endpoint requires an ${IDEMPOTENCY_HEADER} header. ` +
        'Send a unique value per operation — a UUID is ideal — and reuse it when retrying.',
    });
  }

  const trimmed = key.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    throw AppError.validation(`${IDEMPOTENCY_HEADER} is not a usable key`, [
      {
        path: IDEMPOTENCY_HEADER,
        message:
          `must be ${MIN_KEY_LENGTH}–${MAX_KEY_LENGTH} characters of letters, digits, ` +
          '`_`, `.`, `:` or `-`',
      },
    ]);
  }

  return trimmed;
}

/**
 * The scope a key is unique within.
 *
 * Never global. Two customers independently generating the same UUID must not collide,
 * and — more importantly — one caller must not be able to read another's stored response
 * by guessing a key.
 */
export function callerScope(request: IdempotentRequest): string {
  const userId = request.user?.id;
  if (userId) return userId;

  return request.ip ? `${ANONYMOUS_SCOPE_PREFIX}${request.ip}` : UNKNOWN_CALLER_SCOPE;
}
