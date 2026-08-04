/**
 * The console's backend-for-frontend.
 *
 * The browser never calls the banking platform directly. It calls this console, and this
 * module forwards the call. Three things follow from that, and all three are the reason
 * it exists rather than being a convenience:
 *
 * - **Session cookies stay first-party and httpOnly.** No access token is ever readable
 *   by script in the console's origin, so a cross-site injection has nothing to steal.
 * - **The platform's hostname never enters the client bundle.** An internal API stays
 *   internal even though the console is served publicly.
 * - **The operator's real IP address is forwarded.** Staff sign-in is IP-allowlisted, and
 *   a proxy that dropped the client address would present every operator to the platform
 *   as the console's own server and quietly defeat the allowlist.
 */

import { API_PREFIX, CSRF_HEADER, IDEMPOTENCY_HEADER, STEP_UP_HEADER } from '@reliance/contracts';

/** Where the platform runs when nothing configures it. */
const DEFAULT_ORIGIN = 'http://localhost:4400';

/** How long to wait for the platform before giving up on one request. */
const UPSTREAM_TIMEOUT_MS = 30_000;

/** Status returned when the platform could not be reached at all. */
const UPSTREAM_UNREACHABLE_STATUS = 503;

const SET_COOKIE = 'set-cookie';

/** Request headers passed through untouched. Everything else is dropped. */
const FORWARDED_REQUEST_HEADERS: readonly string[] = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'user-agent',
  CSRF_HEADER,
  IDEMPOTENCY_HEADER,
  STEP_UP_HEADER,
];

/** Response headers passed back. `set-cookie` is handled separately — there can be many. */
const FORWARDED_RESPONSE_HEADERS: readonly string[] = [
  'cache-control',
  'content-type',
  'retry-after',
  'x-trace-id',
];

/**
 * The platform's origin, without the version prefix.
 *
 * `API_ORIGIN` is read first so a deployment can point the console at an internal
 * address that is never exposed to the browser; the public URL is only a fallback for
 * local work.
 */
function upstreamOrigin(): string {
  const explicit = process.env.API_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, '');

  const publicUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_ORIGIN;
  return publicUrl.replace(new RegExp(`${API_PREFIX}/?$`), '').replace(/\/$/, '');
}

function requestHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  const client = clientAddress(request);
  if (client) {
    const existing = request.headers.get('x-forwarded-for');
    headers.set('x-forwarded-for', existing ?? client);
  }

  return headers;
}

/** The operator's address, as the edge saw it. */
function clientAddress(request: Request): string | null {
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for');
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  // A refresh can rotate several cookies at once, and `Headers.get` would fold them into
  // one comma-joined string that no browser will parse back into separate cookies.
  for (const cookie of upstream.headers.getSetCookie()) headers.append(SET_COOKIE, cookie);

  return headers;
}

/** The contract's error envelope, for a failure that never reached the platform. */
function unreachable(): Response {
  const body = {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'The banking platform is not responding. Nothing was changed.',
      traceId: crypto.randomUUID(),
      at: new Date().toISOString(),
    },
  };

  return Response.json(body, { status: UPSTREAM_UNREACHABLE_STATUS });
}

/** Reads the request body, or `undefined` for the verbs that never carry one. */
async function requestBody(request: Request): Promise<ArrayBuffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const body = await request.arrayBuffer();
  return body.byteLength === 0 ? undefined : body;
}

/**
 * Forwards one request to the platform and returns its answer.
 *
 * The response body is streamed rather than buffered, so a server-sent event feed —
 * the live transaction ticker, the queue-depth monitor — arrives as it is produced
 * instead of after it ends.
 *
 * @param request The incoming request from the operator's browser.
 * @param segments Path segments after `/api/bff`, version prefix included.
 */
export async function forwardToPlatform(
  request: Request,
  segments: readonly string[],
): Promise<Response> {
  const { search } = new URL(request.url);
  const target = `${upstreamOrigin()}/${segments.join('/')}${search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: requestHeaders(request),
      body: await requestBody(request),
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    });
  } catch {
    return unreachable();
  }
}
