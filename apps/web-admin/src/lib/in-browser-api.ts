/**
 * The in-browser API.
 *
 * With `NEXT_PUBLIC_USE_MOCKS=1` the console answers its own API calls inside the
 * browser, from the stateful fixtures in `@reliance/mocks`, and never reaches the
 * platform. That is what lets the operations console be built, reviewed and demonstrated
 * on a laptop with no backend running, against data that stays coherent — a posting made
 * through it really does move the balance the next screen reads.
 *
 * The worker intercepts by path, and the paths it registers end in the API's version
 * prefix, so the console's own `/api/bff/v1/...` calls are matched without the console
 * needing a second base URL for this mode.
 */

import { USE_IN_BROWSER_API } from '@/lib/env';

/** The boot promise, so twelve components mounting at once produce one worker. */
let booting: Promise<void> | undefined;

async function boot(): Promise<void> {
  const { browserWorker } = await import('@reliance/mocks/browser');
  await browserWorker.start({
    // A Next.js page loads fonts, images and RSC payloads that have no business being
    // intercepted, and warning on every one of them buries the warning that matters.
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
}

/**
 * Starts the in-browser API if this build is configured for it, and resolves either way.
 *
 * Resolving on failure is deliberate: a console that renders and reports failed requests
 * is far more diagnosable than a blank page behind a rejected promise.
 */
export async function startInBrowserApi(): Promise<void> {
  if (!USE_IN_BROWSER_API) return;

  booting ??= boot().catch((cause: unknown) => {
    console.error('The local request handler did not start; requests will go upstream.', cause);
  });

  return booting;
}
