/**
 * The one file that knows about MSW.
 *
 * Everything else in this package deals in plain `MockRoute` descriptors, so the
 * handlers stay unit-testable without a service worker and swapping the interception
 * library out is a change here rather than a change everywhere.
 */

import { http, HttpResponse, type HttpHandler } from 'msw';

import { db } from './db/database.js';
import { mockRoutes } from './handlers/index.js';
import {
  MockMethod,
  Status,
  type MockContext,
  type MockResult,
  type MockRoute,
} from './handlers/kit.js';

const CONTENT_TYPE = 'content-type';
const JSON_TYPE = 'application/json';

/** Converts one descriptor into an MSW handler. */
function toHandler(mockRoute: MockRoute): HttpHandler {
  const resolver = async ({ request, params }: { request: Request; params: unknown }) => {
    const url = new URL(request.url);

    const context: MockContext = {
      params: normaliseParams(params),
      query: url.searchParams,
      headers: request.headers,
      body: await readBody(request),
      db: db(),
    };

    return respond(await mockRoute.resolve(context));
  };

  return http[mockRoute.method](mockRoute.path, resolver);
}

/**
 * MSW gives a path parameter as `string | string[]` because a wildcard segment can match
 * several. None of this contract's routes use one, so the first value is the whole story.
 */
function normaliseParams(params: unknown): Record<string, string> {
  if (typeof params !== 'object' || params === null) return {};
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (typeof value === 'string') result[key] = value;
    else if (Array.isArray(value) && typeof value[0] === 'string') result[key] = value[0];
  }

  return result;
}

/**
 * Reads the body without letting a malformed one throw.
 *
 * A handler that crashed on bad JSON would surface in the browser as an unhandled
 * rejection with no route attached, which is a miserable thing to debug. Returning
 * `undefined` lets the handler answer with the validation error the real API would.
 */
async function readBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const contentType = request.headers.get(CONTENT_TYPE) ?? '';
  if (!contentType.includes(JSON_TYPE)) return undefined;

  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

function respond(result: MockResult): Response {
  const headers = result.headers ?? {};

  if (result.status === Status.NO_CONTENT || result.body === undefined) {
    return new HttpResponse(null, { status: result.status, headers });
  }

  if (typeof result.body === 'string') {
    return HttpResponse.text(result.body, { status: result.status, headers });
  }

  return HttpResponse.json(result.body, { status: result.status, headers });
}

/** Every route, as MSW handlers. Pass to `setupWorker` or `setupServer`. */
export const handlers: HttpHandler[] = mockRoutes.map(toHandler);

/** Builds handlers from a custom route list — used by tests that add or override one. */
export function toMswHandlers(routeList: readonly MockRoute[]): HttpHandler[] {
  return routeList.map(toHandler);
}

/** Re-exported so a caller can build an override without importing the kit separately. */
export { MockMethod };
