/**
 * An in-process HTTP transport over the bank's public API surface.
 *
 * The marketing site renders statically: every rate table, fee schedule and branch list
 * is resolved at build time. Reaching the API over a socket during a static export would
 * make the build depend on a service being up, so the request is dispatched against the
 * route handlers directly instead. Same contract, same envelopes, same error shapes — no
 * network, no service worker, and a build that cannot flake.
 *
 * Setting `RELIANCE_PUBLIC_API_URL` swaps this out for a real origin; see `./client.ts`.
 */

import { ErrorCode } from '@reliance/contracts';
import {
  db,
  extractParams,
  matchPath,
  mockRoutes,
  type MockResult,
  type MockRoute,
} from '@reliance/mocks';

/**
 * Any absolute origin will do: the route patterns are origin-agnostic and only the path
 * is matched. It exists solely so `new URL` has a base for a relative request path.
 */
const RESOLUTION_ORIGIN = 'https://api.reliancebank.example';

const CONTENT_TYPE_HEADER = 'content-type';
const JSON_CONTENT_TYPE = 'application/json';
const NOT_FOUND_STATUS = 404;
const NO_CONTENT_STATUS = 204;

/** The subset of `fetch` the typed client calls. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Dispatches a request against the public route handlers.
 *
 * Every unmatched path answers with the contract's own error envelope rather than a bare
 * 404, so a mis-typed path surfaces in the UI as the same `NOT_FOUND` a real API would
 * produce instead of a parse failure three layers away.
 */
export const inProcessFetch: FetchLike = async (input, init) => {
  const url = new URL(input, RESOLUTION_ORIGIN);
  const method = (init.method ?? 'GET').toLowerCase();
  const match = mockRoutes.find(
    (candidate) => candidate.method === method && matchPath(candidate.path, url.pathname),
  );

  if (!match) return routeNotFound(url.pathname);

  const result = await match.resolve({
    params: extractParams(match.path, url.pathname),
    query: url.searchParams,
    headers: new Headers(init.headers),
    body: readBody(init),
    db: db(),
  });

  return toResponse(result);
};

/** Every route the site is allowed to reach, for the guard in `client.ts`. */
export function publicRoutePatterns(): readonly string[] {
  return mockRoutes.map((candidate: MockRoute) => candidate.path);
}

function readBody(init: RequestInit): unknown {
  if (typeof init.body !== 'string' || init.body.length === 0) return undefined;
  try {
    return JSON.parse(init.body) as unknown;
  } catch {
    return undefined;
  }
}

function toResponse(result: MockResult): Response {
  const headers = new Headers(result.headers);

  if (result.status === NO_CONTENT_STATUS || result.body === undefined) {
    return new Response(null, { status: result.status, headers });
  }

  if (typeof result.body === 'string') {
    headers.set(CONTENT_TYPE_HEADER, 'text/plain; charset=utf-8');
    return new Response(result.body, { status: result.status, headers });
  }

  headers.set(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE);
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

function routeNotFound(pathname: string): Response {
  const body = {
    error: {
      code: ErrorCode.NOT_FOUND,
      message: 'That resource was not found.',
      traceId: pathname,
      at: db().clock.nowIso(),
    },
  };

  return new Response(JSON.stringify(body), {
    status: NOT_FOUND_STATUS,
    headers: { [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE },
  });
}
