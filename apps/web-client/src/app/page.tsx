import { redirect } from 'next/navigation';

import { appRoutes, authRoutes } from '@/lib/routes';
import { readSession } from '@/lib/session';

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/**
 * The front door.
 *
 * There is no landing page here — `reliancebank.example` is the marketing site, and this host exists
 * only to bank on. A visitor either has a session and belongs on their accounts, or does not and
 * belongs on the sign-in screen.
 */
export default async function RootPage(): Promise<never> {
  const session = await readSession();
  redirect(session ? appRoutes.dashboard : authRoutes.signIn);
}
