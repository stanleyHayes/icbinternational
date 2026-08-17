/**
 * Public configuration for the operations console.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time only where it sees the literal member
 * expression, so every read of one happens here and nowhere else. That also gives the
 * rest of the console a single place to look when a value turns out to be wrong.
 */

import { API_PREFIX } from '@reliance/contracts';

/** The value `NEXT_PUBLIC_USE_MOCKS` must hold for the in-browser API to be used. */
const MOCK_FLAG = '1';

/**
 * True when the console serves its own API responses in the browser instead of calling
 * the backend. Lets the console be developed and reviewed without the platform running.
 */
export const USE_IN_BROWSER_API = process.env.NEXT_PUBLIC_USE_MOCKS === MOCK_FLAG;

/** The institution's name, as it appears in titles and headings. */
export const BANK_NAME = process.env.NEXT_PUBLIC_BANK_NAME ?? 'Reliance Bank';

/** Fallback origin, so a clone with no `.env.local` still resolves absolute URLs sensibly. */
const DEFAULT_CONSOLE_URL = 'https://operations.reliancebank.example';

/**
 * This host's own canonical origin.
 *
 * Required by `metadata.metadataBase`, against which relative icon and Open Graph URLs are
 * resolved. Next falls back to `localhost` with only a build-time warning if it is unset,
 * which would ship a share card pointing at whichever machine ran the build.
 */
export const CONSOLE_URL = (
  process.env.NEXT_PUBLIC_CONSOLE_URL?.trim() || DEFAULT_CONSOLE_URL
).replace(/\/$/, '');

/**
 * Origin-relative base for every API call the browser makes.
 *
 * The browser never talks to the platform directly: it calls this console's own route
 * handlers, which hold the upstream origin and forward the session cookies. That keeps
 * the API's hostname out of the client bundle and keeps the cookies first-party.
 */
export const API_BASE_PATH = '/api/bff';

/**
 * Origin of the core banking API, without the version segment.
 *
 * Used solely to address the chat WebSocket (`/v1/chat/stream`): a socket cannot pass
 * through the BFF route handlers, so the stream connects directly, authorised by a
 * short-lived token rather than the session cookie. Every other call still goes through
 * {@link API_BASE_PATH}. `NEXT_PUBLIC_API_URL` carries the `/v1` suffix a human pastes;
 * the client adds the prefix itself, so it is stripped here.
 */
export const API_ORIGIN = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
  return raw.endsWith(API_PREFIX) ? raw.slice(0, -API_PREFIX.length) : raw;
})();

/** Where an operator is sent when they have no session. */
export const SIGN_IN_PATH = '/sign-in';

/** Query parameter carrying the page an operator was trying to reach before signing in. */
export const RETURN_TO_PARAM = 'next';
