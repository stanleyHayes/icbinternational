import 'server-only';

/**
 * Reading the customer's session on the server.
 *
 * Two things establish a session, and they are deliberately separate:
 *
 * 1. The banking API sets httpOnly access and refresh cookies. They are the *authority* — every
 *    protected call is rejected without them, wherever it comes from.
 * 2. This app sets a first-party marker cookie once sign-in has completed. It is a *hint*: it
 *    tells a server render whether to expect a session at all, so a signed-out visitor is sent to
 *    the sign-in screen without a pointless round trip to the bank.
 *
 * The marker is never trusted on its own where the bank can be asked. Forging it gets a visitor a
 * redirect into a dashboard whose every request then answers 401.
 *
 * Refresh is deliberately *not* attempted here. A server component cannot write a rotated cookie
 * back to the browser, so refreshing during a render would burn the refresh token, hand the new
 * one to nobody, and trip the API's token-reuse defence on the next real request — signing the
 * customer out for real. Expiry is recovered in the browser, where the rotated cookie can be
 * received; on the server an expired session simply redirects.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { User } from '@reliance/contracts';

import { serverApi } from './api';
import { HANDLERS_IN_BROWSER, SESSION_COOKIE } from './env';
import { signInWithReturn } from './routes';

/** What the server knows about the signed-in customer. */
export interface DashboardSession {
  /** The customer's public id, taken from the marker cookie. */
  readonly userId: string;
  /**
   * The customer record, when the server was able to fetch it.
   *
   * Null while the app is answering its own calls in the browser: the bank is only reachable from
   * the browser in that mode, so the shell resolves the customer client-side instead.
   */
  readonly user: User | null;
}

/** Attributes of the marker cookie. Shared with the route handler that writes it. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
} as const;

async function markerUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

async function fetchUser(): Promise<User | null> {
  const store = await cookies();
  const header = store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  try {
    const { data } = await serverApi(header).auth.me();
    return data;
  } catch {
    // Any failure here means "cannot prove a session on the server". The caller redirects; the
    // browser will surface the real reason on its own first request.
    return null;
  }
}

/**
 * The current session, or `null` when the visitor is signed out.
 *
 * Cached for the lifetime of one request, so a layout and three nested server components share a
 * single call to the bank rather than making four.
 */
export const readSession = cache(async (): Promise<DashboardSession | null> => {
  const userId = await markerUserId();
  if (!userId) return null;
  if (HANDLERS_IN_BROWSER) return { userId, user: null };

  const user = await fetchUser();
  return user ? { userId: user.id, user } : null;
});

/**
 * The session, or a redirect to sign-in that remembers where the customer was going.
 *
 * @param destination the path being rendered, so sign-in can return the customer to it.
 */
export async function requireSession(destination: string): Promise<DashboardSession> {
  const session = await readSession();
  if (!session) redirect(signInWithReturn(destination));
  return session;
}

/**
 * Sends an already-signed-in customer on to the application.
 *
 * Called by the sign-in and registration screens: showing a sign-in form to somebody who is
 * already signed in is a dead end that looks like the session was lost.
 */
export async function redirectIfSignedIn(destination: string): Promise<void> {
  const session = await readSession();
  if (session) redirect(destination);
}
