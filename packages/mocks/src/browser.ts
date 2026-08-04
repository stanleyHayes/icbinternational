/**
 * Browser entry point.
 *
 * ```ts
 * if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
 *   const { browserWorker } = await import('@reliance/mocks/browser');
 *   await browserWorker.start({ onUnhandledRequest: 'bypass' });
 * }
 * ```
 *
 * `bypass` rather than `warn` is the right default for a Next.js app: the page loads
 * fonts, images and RSC payloads that MSW has no business intercepting, and warning on
 * every one of them buries the warning that matters.
 */

import { setupWorker } from 'msw/browser';

import { handlers } from './msw-adapter.js';

/** The service worker, ready to `start()`. */
export const browserWorker = setupWorker(...handlers);

export { handlers, toMswHandlers } from './msw-adapter.js';
export { db, resetMockDatabase, currentMockSeed, mockClock } from './db/database.js';
