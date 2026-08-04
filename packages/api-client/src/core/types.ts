/**
 * The option objects every resource method accepts.
 *
 * Optional members are written `?: T | undefined` rather than `?: T` because the repo
 * compiles with `exactOptionalPropertyTypes`. Without the explicit `| undefined` a
 * caller could not spread a partially-filled object into these types, which is the one
 * thing option bags exist to allow.
 */

import type { ZodType } from 'zod';

import type { HttpMethod } from './http.js';

/** Values the query serialiser understands. Arrays become repeated keys. */
export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number)[];

export type QueryParams = Readonly<Record<string, QueryValue>>;

/** Options accepted by every call, read-only or otherwise. */
export interface RequestOptions {
  /** Cancels the request; the rejection is the `AbortError` thrown by `fetch`. */
  readonly signal?: AbortSignal | undefined;
  /** Extra headers merged last, so a caller can override anything the client sets. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

/** Options for reads. */
export type QueryOptions = RequestOptions;

/** Options for writes. */
export interface MutationOptions extends RequestOptions {
  /**
   * Replay-protection key. Supply one via {@link withIdempotencyKey} and reuse it for
   * every retry of the same user intention.
   */
  readonly idempotencyKey?: string | undefined;
  /** Proof of a recent step-up authentication, for routes the contract marks `🔐`. */
  readonly stepUpToken?: string | undefined;
}

/**
 * A fully-described call. Resource modules build these; the transport executes them.
 *
 * The spec is a plain value rather than a partially-applied closure so the transport can
 * rebuild the `Request` from scratch when it retries after a refresh — the CSRF cookie
 * rotates during refresh, and a reused `RequestInit` would carry the stale token.
 */
export interface RequestSpec<T> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: QueryParams | undefined;
  readonly body?: unknown;
  /** Contract schema for the response. Enforced in development, skipped in production. */
  readonly schema?: ZodType<T> | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly stepUpToken?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly signal?: AbortSignal | undefined;
  /**
   * Set false on the refresh call itself, and on login, so a 401 there cannot recurse
   * into another refresh attempt.
   */
  readonly allowRefresh?: boolean | undefined;
}

/** A spec with the method already chosen by `get`/`post`/`patch`/`put`/`del`. */
export type MethodlessSpec<T> = Omit<RequestSpec<T>, 'method'>;
