/**
 * `/api/bank/*` — the browser's only route to the banking API.
 *
 * Every verb the contract uses is declared explicitly rather than generated in a loop, because a
 * route handler module is read by Next at build time: a handler that exists only after a
 * `for` loop has run is a handler Next does not know about.
 *
 * See `./forward.ts` for what the proxy does and, more importantly, what it refuses to do.
 */

import type { NextRequest } from 'next/server';

import { forwardToBank } from './forward';

/** The catch-all segments below `/api/bank`, e.g. `/api/bank/v1/accounts` → `['v1','accounts']`. */
interface Context {
  readonly params: Promise<{ readonly path: string[] }>;
}

/** Sessions are per-request and cookie-bound; nothing here may ever be cached or prerendered. */
export const dynamic = 'force-dynamic';

/** The proxy reads `Cookie` and writes `Set-Cookie`, both of which need the Node runtime. */
export const runtime = 'nodejs';

async function handle(request: NextRequest, context: Context): Promise<Response> {
  const { path } = await context.params;
  return forwardToBank(request, path);
}

/** Reads. */
export function GET(request: NextRequest, context: Context): Promise<Response> {
  return handle(request, context);
}

/** Creates and commands. */
export function POST(request: NextRequest, context: Context): Promise<Response> {
  return handle(request, context);
}

/** Full replacements — a KYC step, a preference matrix. */
export function PUT(request: NextRequest, context: Context): Promise<Response> {
  return handle(request, context);
}

/** Partial updates. */
export function PATCH(request: NextRequest, context: Context): Promise<Response> {
  return handle(request, context);
}

/** Removals. */
export function DELETE(request: NextRequest, context: Context): Promise<Response> {
  return handle(request, context);
}
