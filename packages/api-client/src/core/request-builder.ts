/**
 * Building the `Request` for one attempt.
 *
 * Deliberately a pure function of `(spec, config)` and *not* a cached `RequestInit`. The
 * CSRF cookie rotates when the session refreshes, so the retry after a 401 must read the
 * cookie again — reusing an init built before the refresh sends the token the server has
 * just invalidated, and the retry fails with a 403 that looks like a permissions bug.
 */

import { CSRF_HEADER, COOKIE, IDEMPOTENCY_HEADER, STEP_UP_HEADER } from '@reliance/contracts';

import type { ResolvedConfig } from './config.js';
import { CONTENT_TYPE_HEADER, isMutation, JSON_CONTENT_TYPE } from './http.js';
import { buildQueryString, joinUrl } from './query.js';
import type { RequestSpec } from './types.js';

export interface PreparedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

/** Assembles the URL and `RequestInit` for a single attempt at a spec. */
export function buildRequest<T>(spec: RequestSpec<T>, config: ResolvedConfig): PreparedRequest {
  const url =
    joinUrl(config.baseUrl, `${config.prefix}${spec.path}`) + buildQueryString(spec.query);
  const serialisedBody = spec.body === undefined ? undefined : JSON.stringify(spec.body);

  const init: RequestInit = {
    method: spec.method,
    // Auth is httpOnly cookies. Without this the browser sends nothing and every
    // authenticated route answers 401 — including, confusingly, the refresh route.
    credentials: 'include',
    headers: buildHeaders(spec, config, serialisedBody !== undefined),
  };

  if (serialisedBody !== undefined) init.body = serialisedBody;
  if (spec.signal) init.signal = spec.signal;
  return { url, init };
}

function buildHeaders<T>(
  spec: RequestSpec<T>,
  config: ResolvedConfig,
  hasBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = { ...config.defaultHeaders };

  if (hasBody) headers[CONTENT_TYPE_HEADER] = JSON_CONTENT_TYPE;
  if (spec.idempotencyKey) headers[IDEMPOTENCY_HEADER] = spec.idempotencyKey;
  if (spec.stepUpToken) headers[STEP_UP_HEADER] = spec.stepUpToken;

  // Caller headers are merged last so an explicit override always wins.
  return { ...headers, ...csrfHeader(spec, config), ...spec.headers };
}

/**
 * The double-submit half of the CSRF defence: echo the readable `rb.csrf` cookie in a
 * header. A cross-site form post can carry the cookie but cannot set the header, so the
 * pair only matches on requests that same-origin script actually issued.
 */
function csrfHeader<T>(spec: RequestSpec<T>, config: ResolvedConfig): Record<string, string> {
  if (!isMutation(spec.method)) return {};
  const token = config.cookieReader(COOKIE.csrf);
  return token ? { [CSRF_HEADER]: token } : {};
}
