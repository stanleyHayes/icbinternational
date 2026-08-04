/**
 * Public configuration for the operations console.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time only where it sees the literal member
 * expression, so every read of one happens here and nowhere else. That also gives the
 * rest of the console a single place to look when a value turns out to be wrong.
 */

/** The value `NEXT_PUBLIC_USE_MOCKS` must hold for the in-browser API to be used. */
const MOCK_FLAG = '1';

/**
 * True when the console serves its own API responses in the browser instead of calling
 * the backend. Lets the console be developed and reviewed without the platform running.
 */
export const USE_IN_BROWSER_API = process.env.NEXT_PUBLIC_USE_MOCKS === MOCK_FLAG;

/** The institution's name, as it appears in titles and headings. */
export const BANK_NAME = process.env.NEXT_PUBLIC_BANK_NAME ?? 'Reliance Bank';

/**
 * Origin-relative base for every API call the browser makes.
 *
 * The browser never talks to the platform directly: it calls this console's own route
 * handlers, which hold the upstream origin and forward the session cookies. That keeps
 * the API's hostname out of the client bundle and keeps the cookies first-party.
 */
export const API_BASE_PATH = '/api/bff';

/** Where an operator is sent when they have no session. */
export const SIGN_IN_PATH = '/sign-in';

/** Query parameter carrying the page an operator was trying to reach before signing in. */
export const RETURN_TO_PARAM = 'next';
