/**
 * `/api/service-worker` — serves the request-handling worker used when the app answers its own
 * API calls in the browser.
 *
 * It is served from a route handler rather than from `public/` for one reason: `public/` belongs
 * to another workstream, and this workstream must not write into it. A worker fetched from
 * `/api/…` would be scoped to `/api/` by default, so the response carries `Service-Worker-Allowed`
 * to widen it to the whole origin; the registration in `lib/local-handlers.ts` asks for that scope.
 *
 * With `NEXT_PUBLIC_USE_MOCKS` unset this answers `404`, exactly as if the file did not exist.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HANDLERS_IN_BROWSER } from '@/lib/env';

/** Reads from the filesystem. */
export const runtime = 'nodejs';

/** The worker script is only ever served in the browser-handler configuration. */
export const dynamic = 'force-dynamic';

const NOT_FOUND = 404;
const SERVER_ERROR = 500;

/**
 * Resolved from the installed package rather than copied, so the two can never fall out of step.
 *
 * Resolution is anchored at the working directory, not at `import.meta.url`: the bundled server
 * chunk lives under `.next/server`, which has no `node_modules` of its own and therefore cannot
 * see the app's dependencies.
 */
function scriptPath(): string {
  const anchor = pathToFileURL(join(process.cwd(), 'package.json'));
  const packageJson = createRequire(anchor).resolve('msw/package.json');
  return join(dirname(packageJson), 'lib', 'mockServiceWorker.js');
}

/** The worker script, or `404` when the app is configured to use the real banking API. */
export async function GET(): Promise<Response> {
  if (!HANDLERS_IN_BROWSER) return new Response(null, { status: NOT_FOUND });

  let source: string;
  try {
    source = await readFile(scriptPath(), 'utf8');
  } catch (cause) {
    console.error('The browser request handlers could not be served.', cause);
    return new Response('The worker script could not be read.', { status: SERVER_ERROR });
  }

  return new Response(source, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    },
  });
}
