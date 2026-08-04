/**
 * The bank proxy.
 *
 * Every browser call to the banking API lands here first. The point is the cookies: the access and
 * refresh tokens are httpOnly and first-party to *this* origin, so no script in the page can read
 * them and no third-party cookie policy can drop them. The browser talks to its own origin; this
 * handler talks to the bank.
 *
 * Two headers make the round trip in full. `x-csrf-token` is the readable half of the bank's
 * double-submit defence and must arrive unaltered, and `set-cookie` comes back unaltered so a
 * rotated session lands in the browser — without that, the client's silent refresh would rotate a
 * refresh token into a void and the next request would look like token theft.
 *
 * Nothing is added, removed or interpreted. A proxy that invented its own error bodies would give
 * the typed client something the contract does not describe.
 */

import {
  CSRF_HEADER,
  ErrorCode,
  IDEMPOTENCY_HEADER,
  STEP_UP_HEADER,
  TRACE_HEADER,
} from '@reliance/contracts';

import { nowMs } from '@/lib/clock';
import { API_ORIGIN } from '@/lib/env';

/** Headers the bank needs. Anything not listed is this app's business, not the bank's. */
const REQUEST_HEADERS: readonly string[] = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'user-agent',
  CSRF_HEADER,
  IDEMPOTENCY_HEADER,
  STEP_UP_HEADER,
];

/** Headers the browser needs back. `set-cookie` is handled separately — there can be several. */
const RESPONSE_HEADERS: readonly string[] = [
  'content-type',
  'cache-control',
  'retry-after',
  TRACE_HEADER,
];

const BODYLESS_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

const NO_CONTENT = 204;
const RESET_CONTENT = 205;
const NOT_MODIFIED = 304;
const BAD_REQUEST = 400;
const BAD_GATEWAY = 502;

/** Statuses whose response must not carry a body. Relaying one produces a runtime error. */
const BODYLESS_STATUSES: ReadonlySet<number> = new Set([NO_CONTENT, RESET_CONTENT, NOT_MODIFIED]);

/** The contract's error envelope, so the typed client decodes a proxy failure like any other. */
function envelope(code: ErrorCode, message: string, status: number): Response {
  return Response.json(
    { error: { code, message, traceId: '', at: new Date(nowMs()).toISOString() } },
    { status },
  );
}

/**
 * Rebuilds the upstream path from the catch-all segments.
 *
 * Returns `null` for anything that could climb out of the API's namespace. The segments arrive
 * already decoded, so a `..` here is a real traversal attempt rather than an encoding artefact.
 */
function upstreamPath(segments: readonly string[]): string | null {
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..'))
    return null;
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function requestHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function relay(upstream: Response): Response {
  const headers = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) headers.append('set-cookie', cookie);

  const body = BODYLESS_STATUSES.has(upstream.status) ? null : upstream.body;
  return new Response(body, { status: upstream.status, headers });
}

/**
 * Forwards one request to the banking API and relays its answer.
 *
 * @param request the inbound request from the browser.
 * @param segments the path below the proxy prefix, e.g. `['v1', 'accounts']`.
 */
export async function forwardToBank(
  request: Request,
  segments: readonly string[],
): Promise<Response> {
  const path = upstreamPath(segments);
  if (!path) {
    return envelope(ErrorCode.NOT_FOUND, 'That endpoint does not exist.', BAD_REQUEST);
  }

  const init: RequestInit = {
    method: request.method,
    headers: requestHeaders(request),
    redirect: 'manual',
    cache: 'no-store',
  };
  if (!BODYLESS_METHODS.has(request.method)) init.body = await request.text();

  try {
    const search = new URL(request.url).search;
    return relay(await fetch(`${API_ORIGIN}/${path}${search}`, init));
  } catch {
    return envelope(
      ErrorCode.SERVICE_UNAVAILABLE,
      'We could not reach the bank just now. Please try again in a few moments.',
      BAD_GATEWAY,
    );
  }
}
