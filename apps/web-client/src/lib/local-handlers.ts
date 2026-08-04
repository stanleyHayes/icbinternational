/**
 * Answering the app's own API calls in the browser.
 *
 * `@reliance/mocks` ships a stateful, coherent implementation of every route in the contract: a
 * transfer debits the source account, appears at the top of the feed and raises a notification.
 * Registering it as a service worker means the dashboard behaves like a bank with no bank running
 * behind it — which is what makes the front end developable and reviewable on its own.
 *
 * The worker script is served by `app/api/service-worker`, not from `public/`, because that
 * directory belongs to another workstream. A worker registered under `/api/` would normally be
 * scoped to `/api/`, so the route handler sends `Service-Worker-Allowed: /` and the registration
 * asks for the root scope explicitly.
 */

/** Where the worker script is served from. Must match the route handler's path. */
export const WORKER_SCRIPT_PATH = '/api/service-worker';

let startup: Promise<void> | null = null;

async function register(): Promise<void> {
  const { browserWorker } = await import('@reliance/mocks/browser');

  await browserWorker.start({
    serviceWorker: { url: WORKER_SCRIPT_PATH, options: { scope: '/' } },
    // A Next app loads fonts, images and RSC payloads that these handlers have no business
    // intercepting. Warning on each of them buries the one warning that would matter.
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
}

/**
 * Starts the request handlers, once per page load.
 *
 * Resolves when interception is live. Safe to await from several places — the second caller gets
 * the first caller's promise rather than a second registration.
 */
export function startBrowserHandlers(): Promise<void> {
  startup ??= register();
  return startup;
}
