import { Injectable } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { IdempotencyKeyRepository, type KeyScope } from './idempotency-key.repository.js';
import { IdempotencyStatus } from './idempotency-key.schema.js';

/** The stored answer to a completed request. */
export interface StoredResponse {
  readonly status: number;
  readonly body: unknown;
}

/** What the caller should do next. */
export type ClaimOutcome =
  /** The key is ours. Run the handler, then call {@link IdempotencyService.complete}. */
  | { readonly kind: 'EXECUTE' }
  /** Already answered. Return this verbatim; do not run the handler. */
  | { readonly kind: 'REPLAY'; readonly response: StoredResponse };

/**
 * The decision procedure behind `@Idempotent()`.
 *
 * Four outcomes, and getting the difference between them right is the whole point:
 *
 * | Situation | Outcome |
 * |---|---|
 * | Key unseen | claim it and execute |
 * | Same key, same payload, finished | replay the stored response |
 * | Same key, same payload, still running | `IDEMPOTENT_REQUEST_IN_FLIGHT` (409) |
 * | Same key, **different** payload | `IDEMPOTENCY_KEY_REUSED` (409) |
 *
 * The last row is the one that saves a customer. A client that generates one key and
 * reuses it for the next transfer would otherwise be handed the *first* transfer's
 * receipt and conclude the second one succeeded. Comparing the request fingerprint turns
 * that silent loss into a loud, correctable error.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly keys: IdempotencyKeyRepository,
    private readonly clock: ClockService,
  ) {}

  /** Claims the key, or decides what the duplicate deserves. */
  async begin(input: KeyScope & { requestHash: string }): Promise<ClaimOutcome> {
    const claimed = await this.keys.claim(input);
    if (claimed) return { kind: 'EXECUTE' };

    const existing = await this.keys.find(input);

    // The claim was rejected but nothing is there now: the owner failed and released it
    // between our insert and our read. Telling the client to retry is honest and safe —
    // its next attempt claims the key cleanly.
    if (!existing) throw inFlight(input.key);

    if (existing.requestHash !== input.requestHash) throw reused(input.key);
    if (existing.status === IdempotencyStatus.IN_FLIGHT) throw inFlight(input.key);

    return {
      kind: 'REPLAY',
      response: {
        status: existing.responseStatus ?? DEFAULT_REPLAY_STATUS,
        body: existing.responseBody,
      },
    };
  }

  /** Records the handler's answer so any later replay returns exactly it. */
  async complete(input: KeyScope & { status: number; body: unknown }): Promise<void> {
    await this.keys.complete({
      key: input.key,
      userId: input.userId,
      responseStatus: input.status,
      responseBody: input.body,
      completedAt: this.clock.now(),
    });
  }

  /**
   * Releases a claim whose handler threw.
   *
   * A failed request changed nothing, so holding its key for 24 hours would lock the
   * client out of retrying a transfer that never happened. The claim is deleted rather
   * than marked failed: a deleted key is indistinguishable from an unused one, which is
   * exactly the semantics a retry needs.
   */
  async release(scope: KeyScope): Promise<void> {
    await this.keys.release(scope);
  }
}

/** Falls back to 200 only if a completed claim somehow stored no status. */
const DEFAULT_REPLAY_STATUS = 200;

function inFlight(key: string): AppError {
  return new AppError({
    code: ErrorCode.IDEMPOTENT_REQUEST_IN_FLIGHT,
    message:
      'A request with this Idempotency-Key is still being processed. ' +
      'Retry shortly with the same key to receive the original response.',
    context: { key },
  });
}

function reused(key: string): AppError {
  return new AppError({
    code: ErrorCode.IDEMPOTENCY_KEY_REUSED,
    message:
      'This Idempotency-Key was already used for a request with a different payload. ' +
      'Generate a new key for each distinct operation.',
    context: { key },
  });
}
