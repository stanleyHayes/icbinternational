/**
 * The one API client the public site uses. **Server-side only** — import it from a
 * server component, a route handler or a server action, never from `'use client'` code.
 *
 * It is created once per server runtime, not once per render: the typed client holds the
 * refresh coordination and the resolved config, and building a fresh one inside a page
 * would throw that away on every request.
 *
 * **This client only ever touches `/public/*`.** The site has no session, no cookie and
 * no CSRF token, and `assertPublicPath` fails loudly rather than letting a copy-pasted
 * call reach a customer route and 401 in production.
 */

import { createApiClient, noCookieReader, type ApiClient } from '@reliance/api-client';

import { inProcessFetch, type FetchLike } from './in-process-transport';

/** Route prefix the unauthenticated surface lives under. */
const PUBLIC_PREFIX = '/public/';

/** Also allowed: the liveness probe the status page reads. */
const SYSTEM_PREFIX = '/system/';

let cached: ApiClient | null = null;

/**
 * Refuses any path outside the unauthenticated surface.
 *
 * @throws {Error} when a call would reach an authenticated route.
 */
function assertPublicPath(path: string): void {
  if (path.startsWith(PUBLIC_PREFIX) || path.startsWith(SYSTEM_PREFIX)) return;
  throw new Error(`The public site may not call ${path}; it has no session to present.`);
}

function guarded(baseFetch: FetchLike): FetchLike {
  return (input, init) => {
    assertPublicPath(pathOf(input));
    return baseFetch(input, init);
  };
}

function pathOf(input: string): string {
  const withoutOrigin = input.replace(/^[a-z]+:\/\/[^/]+/i, '');
  const withoutQuery = withoutOrigin.split('?')[0] ?? withoutOrigin;
  const versionSegment = withoutQuery.indexOf('/', 1);
  return versionSegment === -1 ? withoutQuery : withoutQuery.slice(versionSegment);
}

/**
 * The public API client.
 *
 * Set `RELIANCE_PUBLIC_API_URL` to point the site at a running API; with it unset the
 * request is resolved in-process so a static build never depends on a socket.
 */
export function publicApi(): ApiClient {
  if (cached) return cached;

  const baseUrl = process.env.RELIANCE_PUBLIC_API_URL ?? '';
  const transport: FetchLike = baseUrl ? (input, init) => fetch(input, init) : inProcessFetch;

  cached = createApiClient({
    baseUrl,
    fetch: guarded(transport),
    cookieReader: noCookieReader,
    // Contract drift on a public page is a broken rate table, and a loud failure at
    // build time is far cheaper than a quietly wrong number on a pricing page.
    validateResponses: true,
  });

  return cached;
}
