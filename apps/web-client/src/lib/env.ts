/**
 * Public configuration for the customer dashboard.
 *
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time only where it appears as a literal
 * member expression, so every read of one happens here and nowhere else. Everything downstream
 * imports a named constant, which also means a missing variable produces one predictable default
 * rather than a different guess in each module.
 */

import { API_PREFIX } from '@reliance/contracts';

/** Matches the root `.env.example`, so a clone with no `.env.local` still points somewhere real. */
const DEFAULT_API_URL = 'http://localhost:4400/v1';

const DEFAULT_BANK_NAME = 'Reliance Bank';

/** Matches `APP_URL` in the marketing site's `content/site.ts`, which links here. */
const DEFAULT_APP_URL = 'https://app.reliancebank.example';

/** The only value of `NEXT_PUBLIC_USE_MOCKS` that switches the app off the network. */
const IN_BROWSER_HANDLERS_FLAG = '1';

function withoutTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Strips the version segment from the configured URL.
 *
 * `NEXT_PUBLIC_API_URL` is written with `/v1` on the end because that is the address a human
 * would paste into a browser, but `@reliance/api-client` adds the prefix itself. Leaving both in
 * produces `/v1/v1/accounts`, which 404s in a way that looks like a routing bug rather than a
 * configuration one.
 */
function toOrigin(raw: string): string {
  const trimmed = withoutTrailingSlash(raw.trim());
  return trimmed.endsWith(API_PREFIX) ? trimmed.slice(0, -API_PREFIX.length) : trimmed;
}

/** The bank's name, as it appears in titles, headings and transactional copy. */
export const BANK_NAME = process.env.NEXT_PUBLIC_BANK_NAME?.trim() || DEFAULT_BANK_NAME;

/**
 * This host's own canonical origin.
 *
 * Needed because `metadata.metadataBase` has to be absolute: relative Open Graph and icon
 * URLs are resolved against it, and Next falls back to `localhost` with a build-time warning
 * if it is missing — which ships share cards pointing at a machine nobody else can reach.
 */
export const APP_URL = withoutTrailingSlash(
  process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL,
);

/** Origin of the core banking API, without the version segment. Server-side use only. */
export const API_ORIGIN = toOrigin(process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL);

/**
 * True when the app answers its own API calls in the browser instead of reaching the network.
 *
 * This is what lets the whole dashboard be built, reviewed and shown without the banking API
 * running. See `lib/local-handlers.ts` for how the switch is honoured.
 */
export const HANDLERS_IN_BROWSER = process.env.NEXT_PUBLIC_USE_MOCKS === IN_BROWSER_HANDLERS_FLAG;

/**
 * Same-origin prefix every browser API call goes through.
 *
 * Requests land on the route handler in `app/api/bank/[...path]`, which forwards them to the
 * banking API together with the session cookies. The browser therefore never holds a token in
 * JavaScript, and the session cookies stay first-party.
 */
export const BFF_BASE_PATH = '/api/bank';

/** Cookie recording that this browser has completed sign-in. Read only on the server. */
export const SESSION_COOKIE = 'rb.web';

/** True in a production build. Controls response validation and log verbosity. */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
