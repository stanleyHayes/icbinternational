/**
 * Access to the banking API, from either side of the render boundary.
 *
 * Two accessors, because the two runtimes need different things:
 *
 * - **`browserApi()`** talks to this app's own origin under {@link BFF_BASE_PATH}. The route
 *   handler behind that path attaches the session cookies and forwards to the bank. Nothing in
 *   the browser ever sees an access token, and the cookies stay first-party, which is what makes
 *   them survive a browser's third-party cookie policy.
 * - **`serverApi(cookieHeader)`** talks to the banking API directly. `credentials: 'include'`
 *   means nothing on a server, so the caller's `Cookie` header is forwarded explicitly.
 *
 * With `NEXT_PUBLIC_USE_MOCKS=1` the browser answers its own requests: {@link bootstrapBrowserApi}
 * starts the request handlers from `@reliance/mocks` before the first call goes out, and the
 * route handler behind {@link BFF_BASE_PATH} is simply never reached. That switch is what lets the
 * whole dashboard be developed and shown without the banking API running.
 */

import { cookieHeaderReader, createApiClient, type ApiClient } from '@reliance/api-client';

import { API_ORIGIN, BFF_BASE_PATH, HANDLERS_IN_BROWSER, IS_PRODUCTION } from './env';
import { startBrowserHandlers } from './local-handlers';

let browserClient: ApiClient | null = null;
let sessionExpired: (() => void) | null = null;

/**
 * Registers what happens when a 401 survives the client's one silent refresh.
 *
 * The transport refreshes once, shares that attempt across every concurrent request, and calls
 * this only when the retry is still unauthorised. The shell wires it to a redirect that keeps the
 * page the customer was on.
 */
export function onSessionExpired(handler: () => void): void {
  sessionExpired = handler;
}

/**
 * The browser's client. One per browser session.
 *
 * Built once because the single-refresh coordination lives inside the transport instance: a client
 * created per component would refresh once *per component*, which is exactly the stampede the
 * shared refresh exists to prevent.
 */
export function browserApi(): ApiClient {
  browserClient ??= createApiClient({
    baseUrl: BFF_BASE_PATH,
    validateResponses: !IS_PRODUCTION,
    onUnauthenticated: () => sessionExpired?.(),
  });
  return browserClient;
}

/**
 * Prepares the browser for its first API call.
 *
 * Idempotent, and awaited once by the provider tree before anything is allowed to fetch. Starting
 * the handlers *after* the first request has gone out is the classic cause of one unexplained
 * failure on every hard reload.
 */
export async function bootstrapBrowserApi(): Promise<ApiClient> {
  if (HANDLERS_IN_BROWSER) await startBrowserHandlers();
  return browserApi();
}

/**
 * A client for a server component or route handler, bound to one inbound request.
 *
 * Not cached: it carries that request's cookies, and a shared instance would hand one customer's
 * session to the next request the server happens to serve.
 *
 * @param cookieHeader the raw `Cookie` header of the inbound request.
 */
export function serverApi(cookieHeader: string): ApiClient {
  return createApiClient({
    baseUrl: API_ORIGIN,
    validateResponses: !IS_PRODUCTION,
    cookieReader: cookieHeaderReader(cookieHeader),
    defaultHeaders: cookieHeader ? { cookie: cookieHeader } : {},
  });
}
