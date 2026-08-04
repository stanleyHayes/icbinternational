/**
 * The transport: one fetch, one shared refresh, one retry.
 *
 * The interesting behaviour is the 401 path. Twelve widgets mount at once, all twelve
 * requests come back 401 because the access cookie expired a second ago, and the naive
 * client fires twelve refreshes. Eleven of them present a refresh token that the first
 * one has already rotated, the API reads that as `TOKEN_REUSE_DETECTED` — which is the
 * signature of a stolen token — and kills the session. The user is logged out by their
 * own dashboard loading.
 *
 * So refreshes are serialised through a single in-flight promise, and every request
 * records the refresh generation it was sent under. A 401 whose generation is already
 * stale means somebody else refreshed while the request was in the air: retry
 * immediately, refresh nothing.
 */

import { routes } from '@reliance/contracts';

import type { ResolvedConfig } from './config.js';
import { ApiClientError, transportFailure } from './errors.js';
import { HttpMethod, HttpStatus } from './http.js';
import { buildRequest } from './request-builder.js';
import { decodeResponse } from './response.js';
import type { MethodlessSpec, RequestSpec } from './types.js';

export class HttpTransport {
  private refreshInFlight: Promise<boolean> | null = null;

  /**
   * Incremented on every successful refresh. Requests capture it before they are sent
   * so a 401 can be told apart from a 401 that a concurrent refresh has already fixed.
   */
  private refreshGeneration = 0;

  constructor(private readonly config: ResolvedConfig) {}

  async request<T>(spec: RequestSpec<T>): Promise<T> {
    const generation = this.refreshGeneration;
    const response = await this.send(spec);

    if (response.status !== HttpStatus.UNAUTHORIZED || spec.allowRefresh === false) {
      return this.decode(response, spec);
    }

    const recovered = await this.recover(generation);
    if (!recovered) {
      this.config.onUnauthenticated?.();
      return this.decode(response, spec);
    }

    // Exactly one retry. A second 401 is a real authentication failure and propagates,
    // because retrying past that is how a client ends up in an invisible refresh loop.
    const retried = await this.send(spec);
    if (retried.status === HttpStatus.UNAUTHORIZED) this.config.onUnauthenticated?.();
    return this.decode(retried, spec);
  }

  get<T>(spec: MethodlessSpec<T>): Promise<T> {
    return this.request({ ...spec, method: HttpMethod.GET });
  }

  post<T>(spec: MethodlessSpec<T>): Promise<T> {
    return this.request({ ...spec, method: HttpMethod.POST });
  }

  put<T>(spec: MethodlessSpec<T>): Promise<T> {
    return this.request({ ...spec, method: HttpMethod.PUT });
  }

  patch<T>(spec: MethodlessSpec<T>): Promise<T> {
    return this.request({ ...spec, method: HttpMethod.PATCH });
  }

  delete<T>(spec: MethodlessSpec<T>): Promise<T> {
    return this.request({ ...spec, method: HttpMethod.DELETE });
  }

  /** Number of refreshes performed. Exposed so tests can assert "exactly one". */
  get refreshCount(): number {
    return this.refreshGeneration;
  }

  private async send<T>(spec: RequestSpec<T>): Promise<Response> {
    const { url, init } = buildRequest(spec, this.config);
    try {
      return await this.config.fetch(url, init);
    } catch (cause) {
      // An aborted request is the caller's own doing, so it propagates untouched rather
      // than being relabelled as the bank being unreachable.
      if (isAbortError(cause)) throw cause;
      throw transportFailure(spec.path, cause);
    }
  }

  private decode<T>(response: Response, spec: RequestSpec<T>): Promise<T> {
    return decodeResponse({
      response,
      path: spec.path,
      schema: spec.schema,
      validate: this.config.validateResponses,
    });
  }

  /** Refreshes unless a concurrent request already did it under a newer generation. */
  private async recover(generation: number): Promise<boolean> {
    if (this.refreshGeneration !== generation) return true;
    return this.refreshOnce();
  }

  private async refreshOnce(): Promise<boolean> {
    const existing = this.refreshInFlight;
    if (existing) return existing;

    const attempt = this.performRefresh();
    this.refreshInFlight = attempt;
    try {
      return await attempt;
    } finally {
      // Guarded so a refresh that started after this one finished is not cleared by it.
      if (this.refreshInFlight === attempt) this.refreshInFlight = null;
    }
  }

  private async performRefresh(): Promise<boolean> {
    const spec: RequestSpec<unknown> = {
      method: HttpMethod.POST,
      path: routes.auth.refresh,
      allowRefresh: false,
    };

    let response: Response;
    try {
      response = await this.send(spec);
    } catch {
      // A refresh that could not be delivered is not a failed refresh — the caller's
      // original error is the honest one to surface, so report "not recovered".
      return false;
    }

    if (!response.ok) return false;
    this.refreshGeneration += 1;
    return true;
  }
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

/** Re-exported so callers can catch the client's only error type from one place. */
export { ApiClientError };
