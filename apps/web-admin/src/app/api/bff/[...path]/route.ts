/**
 * `/api/bff/*` — the console's proxy to the banking platform.
 *
 * Every verb the API contract uses is forwarded verbatim. The console adds nothing to
 * the request and interprets nothing in the response: authorisation, idempotency and
 * validation all belong to the platform, and a proxy that second-guessed any of them
 * would be a second implementation of rules that must have exactly one.
 */

import { forwardToPlatform } from '@/lib/server/upstream';

/** Route parameters. Next resolves dynamic segments asynchronously. */
interface RouteContext {
  readonly params: Promise<{ readonly path: string[] }>;
}

/**
 * Never cached and never prerendered: every call carries the operator's session, and a
 * cached answer would be one operator's data served to another.
 */
export const dynamic = 'force-dynamic';

/** Node, not the edge — the proxy reads and forwards `set-cookie`, which edge KV cannot. */
export const runtime = 'nodejs';

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return forwardToPlatform(request, path);
}

/** Reads. */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

/** Creates and actions. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

/** Full replacements. */
export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

/** Partial updates. */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

/** Removals. */
export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}
