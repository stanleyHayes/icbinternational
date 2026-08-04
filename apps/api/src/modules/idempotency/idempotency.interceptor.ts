import {
  HttpStatus,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Response } from 'express';
import { catchError, concatMap, from, map, of, type Observable } from 'rxjs';

import { callerScope, readIdempotencyKey, type IdempotentRequest } from './idempotency-request.js';
import { IDEMPOTENT_REPLAY_HEADER } from './idempotency.constants.js';
import { IdempotencyService, type StoredResponse } from './idempotency.service.js';
import { IDEMPOTENT_METADATA } from './idempotent.decorator.js';
import { hashRequest } from './request-hash.js';

/**
 * Enforces `@Idempotent()`.
 *
 * The claim is taken **before** the handler runs and released only if the handler throws,
 * so the window in which a duplicate could slip past is the insert itself — and MongoDB's
 * unique index closes that one. Two identical requests arriving together therefore
 * produce exactly one execution: the loser never reaches the handler at all.
 *
 * What is stored is the handler's own return value, not the serialised HTTP body. The
 * global `ResponseEnvelopeInterceptor` wraps whatever this interceptor emits, so a replay
 * goes through the identical wrapping as the original and the two responses are the same
 * bytes — without this interceptor needing to know the envelope's shape.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.get<boolean | undefined>(
      IDEMPOTENT_METADATA,
      context.getHandler(),
    );

    if (!enabled || context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<IdempotentRequest>();
    const response = http.getResponse<Response>();

    // Throws IDEMPOTENCY_KEY_REQUIRED before any work happens, which is the point: an
    // unprotected money movement must never reach the handler.
    const scope = { key: readIdempotencyKey(request), userId: callerScope(request) };
    const requestHash = hashRequest({
      method: request.method,
      path: request.originalUrl || request.url,
      body: request.body,
    });

    return from(this.idempotency.begin({ ...scope, requestHash })).pipe(
      concatMap((outcome) =>
        outcome.kind === 'REPLAY'
          ? replay(response, outcome.response)
          : this.execute(next, response, scope),
      ),
    );
  }

  /** Runs the handler, storing its answer on success and releasing the key on failure. */
  private execute(
    next: CallHandler,
    response: Response,
    scope: KeyScopeInput,
  ): Observable<unknown> {
    return next.handle().pipe(
      concatMap((payload) =>
        from(
          this.idempotency.complete({
            ...scope,
            status: response.statusCode || HttpStatus.OK,
            body: payload ?? null,
          }),
        ).pipe(map(() => payload)),
      ),
      catchError((error: unknown) => from(this.releaseThen(scope, error))),
    );
  }

  /**
   * Releases the claim, then re-throws the original error.
   *
   * A failure to release is swallowed deliberately: the caller's real problem is the
   * error that just happened, and replacing it with a storage error would hide the cause
   * and leave the client with no idea what actually went wrong. The orphaned claim
   * expires on its own within the TTL.
   */
  private async releaseThen(scope: KeyScopeInput, error: unknown): Promise<never> {
    try {
      await this.idempotency.release(scope);
    } catch (releaseError) {
      this.logger.error(
        `Failed to release idempotency key ${scope.key}; it will expire with its TTL`,
        releaseError instanceof Error ? releaseError.stack : String(releaseError),
      );
    }

    throw error;
  }
}

interface KeyScopeInput {
  readonly key: string;
  readonly userId: string;
}

/**
 * Answers from storage without touching the handler.
 *
 * The header lets a client distinguish "we did the work" from "you already had this",
 * which matters when reconciling: two 201s with the same body are otherwise ambiguous.
 */
function replay(response: Response, stored: StoredResponse): Observable<unknown> {
  response.status(stored.status);
  response.setHeader(IDEMPOTENT_REPLAY_HEADER, 'true');
  return of(stored.body);
}
