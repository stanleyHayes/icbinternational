/**
 * `/api/session` — the marker that says sign-in finished.
 *
 * The banking API's cookies are the authority on whether a session exists; this cookie only tells
 * a *server render* whether to expect one, so a signed-out visitor is redirected without a
 * pointless round trip to the bank.
 *
 * `POST` never takes the browser's word for who it is. Where the bank is reachable from the
 * server, it is asked, and the id it answers with is the one written. The body is consulted only
 * when the app is answering its own calls in the browser, where there is nobody else to ask.
 */

import { cookies } from 'next/headers';
import { z } from 'zod';

import { entityId } from '@reliance/contracts';

import { serverApi } from '@/lib/api';
import { HANDLERS_IN_BROWSER, SESSION_COOKIE } from '@/lib/env';
import { SESSION_COOKIE_OPTIONS, readSession } from '@/lib/session';

/** Cookie-bound and per-request: nothing here may be cached. */
export const dynamic = 'force-dynamic';

/** Reads and writes cookies. */
export const runtime = 'nodejs';

const UNAUTHORISED = 401;

const claimSchema = z.object({ userId: entityId('usr') });

const ACKNOWLEDGED = { data: { acknowledged: true } } as const;

async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

/** Asks the bank who the caller is. Returns `null` when it will not say. */
async function confirmedUserId(): Promise<string | null> {
  try {
    const { data } = await serverApi(await cookieHeader()).auth.me();
    return data.id;
  } catch {
    return null;
  }
}

async function claimedUserId(request: Request): Promise<string | null> {
  try {
    const parsed = claimSchema.safeParse(await request.json());
    return parsed.success ? parsed.data.userId : null;
  } catch {
    return null;
  }
}

/**
 * Records that this browser has signed in.
 *
 * @returns `401` when no session can be proven, so a failed sign-in cannot leave a marker behind.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = HANDLERS_IN_BROWSER ? await claimedUserId(request) : await confirmedUserId();
  if (!userId) {
    return Response.json(
      { error: { code: 'UNAUTHENTICATED', message: 'That session could not be confirmed.' } },
      { status: UNAUTHORISED },
    );
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, userId, SESSION_COOKIE_OPTIONS);
  return Response.json(ACKNOWLEDGED);
}

/**
 * Forgets the session.
 *
 * Always succeeds. Signing out is the one action a customer must never be told they cannot do.
 */
export async function DELETE(): Promise<Response> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json(ACKNOWLEDGED);
}

/** Whether this browser currently holds a session. Used by the shell after it wakes from sleep. */
export async function GET(): Promise<Response> {
  const session = await readSession();
  return Response.json({ data: { signedIn: session !== null } });
}
