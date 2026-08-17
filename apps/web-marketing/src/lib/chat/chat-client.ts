/**
 * The browser-side API client for guest chat, built once per page load.
 *
 * `publicApi()` in `lib/api/client.ts` is server-side only, so the widget gets its own —
 * the same typed client pointed at the public API origin. Guest chat needs no cookies and
 * no CSRF token, hence `noCookieReader`.
 *
 * With no configured URL the client targets the current origin, which is what Jest + MSW
 * wants: the mock handlers match any origin.
 */

import { createApiClient, noCookieReader, type ApiClient } from '@reliance/api-client';
import { API_PREFIX } from '@reliance/contracts';

let cached: ApiClient | null = null;

export function chatClient(): ApiClient {
  if (cached) return cached;

  cached = createApiClient({
    baseUrl: toOrigin(process.env.NEXT_PUBLIC_API_URL ?? ''),
    cookieReader: noCookieReader,
  });

  return cached;
}

/**
 * `NEXT_PUBLIC_API_URL` is written with `/v1` on the end, but the client adds the prefix
 * itself — the same normalisation `apps/web-client/src/lib/env.ts` does, kept local so this
 * code does not reach into another app.
 */
function toOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  return trimmed.endsWith(API_PREFIX) ? trimmed.slice(0, -API_PREFIX.length) : trimmed;
}
