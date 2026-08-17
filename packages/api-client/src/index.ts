/**
 * `@reliance/api-client` — the typed way to call the Reliance Bank API.
 *
 * ```ts
 * import { createApiClient, ApiClientError, withIdempotencyKey } from '@reliance/api-client';
 *
 * const client = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL });
 *
 * try {
 *   await client.transfers.create({ quoteId }, withIdempotencyKey());
 * } catch (error) {
 *   if (ApiClientError.isApiClientError(error) && error.is('INSUFFICIENT_FUNDS')) {
 *     showTopUpPrompt();
 *   }
 * }
 * ```
 *
 * Three behaviours are worth knowing before you use it:
 *
 * - **Cookies carry the session.** Every request sends `credentials: 'include'` and
 *   echoes the `rb.csrf` cookie in a header. Nothing here reads or stores a token.
 * - **A 401 refreshes once, and only once, across all concurrent requests.** Twelve
 *   parallel calls that all get 401 produce one refresh, then twelve retries. A second
 *   401 propagates and `onUnauthenticated` fires.
 * - **Responses are validated against the contract outside production.** Contract drift
 *   fails loudly in development and costs nothing in the browser.
 */

export { createApiClient, type ApiClient } from './client.js';

export {
  resolveConfig,
  type ApiClientConfig,
  type FetchLike,
  type ResolvedConfig,
} from './core/config.js';

export {
  cookieHeaderReader,
  documentCookieReader,
  noCookieReader,
  parseCookieHeader,
  type CookieReader,
} from './core/cookies.js';

export { ApiClientError, transportFailure, type ApiClientErrorInit } from './core/errors.js';

export {
  errorCodeForStatus,
  HttpMethod,
  HttpStatus,
  isMutation,
  TRANSPORT_FAILURE_STATUS,
} from './core/http.js';

export { newIdempotencyKey, withIdempotencyKey, withStepUpToken } from './core/idempotency.js';

export { buildQueryString, joinUrl } from './core/query.js';
export { decodeResponse, toApiClientError, type DecodeOptions } from './core/response.js';
export { buildRequest, type PreparedRequest } from './core/request-builder.js';
export { HttpTransport } from './core/transport.js';

export type {
  MethodlessSpec,
  MutationOptions,
  QueryOptions,
  QueryParams,
  QueryValue,
  RequestOptions,
  RequestSpec,
} from './core/types.js';

// --- Resource groups ------------------------------------------------------
// Exported so an app can type a function that takes just one group, rather than
// dragging the whole client through its signatures.

export * from './resources/accounts.js';
export * from './resources/admin/index.js';
export * from './resources/auth.js';
export * from './resources/beneficiaries.js';
export * from './resources/borrow.js';
export * from './resources/bulk-transfers.js';
export * from './resources/business.js';
export * from './resources/cards.js';
export * from './resources/chat.js';
export * from './resources/devices.js';
export * from './resources/files.js';
export * from './resources/fx.js';
export * from './resources/insights.js';
export * from './resources/kyc.js';
export * from './resources/mfa.js';
export * from './resources/notifications.js';
export * from './resources/payments.js';
export * from './resources/profile.js';
export * from './resources/public.js';
export * from './resources/save.js';
export * from './resources/simulation.js';
export * from './resources/support.js';
export * from './resources/system.js';
export * from './resources/transactions.js';
export * from './resources/transfer-orders.js';
export * from './resources/transfers.js';

// --- Provisional contract shapes -----------------------------------------
// Schemas for routes the frozen contract declares but does not describe. `@reliance/mocks`
// imports these so client and mocks cannot disagree. See `src/provisional/README.md`.

export * from './provisional/index.js';
