/**
 * Node entry point, for Jest and for Next.js server-side rendering.
 *
 * ```ts
 * import { server } from '@reliance/mocks/server';
 * import { resetMockDatabase } from '@reliance/mocks';
 *
 * beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
 * beforeEach(() => resetMockDatabase());
 * afterAll(() => server.close());
 * ```
 *
 * `onUnhandledRequest: 'error'` is the right default in tests, and the opposite of the
 * browser's: a test that reaches an unmocked endpoint has found real drift, and should
 * fail loudly rather than quietly hitting the network.
 */

import { setupServer } from 'msw/node';

import { handlers } from './msw-adapter.js';

/** The interceptor, ready to `listen()`. */
export const server = setupServer(...handlers);

export { handlers, toMswHandlers } from './msw-adapter.js';
export { db, resetMockDatabase, currentMockSeed, mockClock } from './db/database.js';
