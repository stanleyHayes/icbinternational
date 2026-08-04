/**
 * What wraps the page.
 *
 * Sign-in is the only screen in this console that renders without the chrome, so the
 * decision is made once, here, rather than by giving every future route group its own
 * layout to remember. A screen the operations team adds tomorrow gets the sidebar, the
 * search palette and the customer banner without doing anything at all.
 *
 * It is also the session gate. A console route never renders before the platform has
 * said who is signed in: rendering a queue and then replacing it with a sign-in form
 * would mean customer data reaching a screen the operator has no session for.
 */

'use client';

import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { Button, ErrorState, Spinner } from '@reliance/ui';

import { RETURN_TO_PARAM, SIGN_IN_PATH } from '@/lib/env';
import { useReplace, withParam } from '@/lib/routes';
import { useAdminSession } from '@/lib/session';

import { ConsoleShell } from './console-shell';

function ResolvingSession() {
  return (
    <div className="bg-canvas flex h-dvh items-center justify-center">
      <Spinner className="text-accent size-6" label="Checking your session" />
    </div>
  );
}

function SessionUnavailable() {
  return (
    <div className="bg-canvas flex h-dvh items-center justify-center p-6">
      <ErrorState
        title="We could not confirm who is signed in"
        description="The banking platform did not answer. Nothing has been changed, and you can try again."
        action={<Button onClick={() => globalThis.location.reload()}>Try again</Button>}
      />
    </div>
  );
}

function ConsoleRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { operator, isResolving, isUnavailable } = useAdminSession();
  const pathname = usePathname();
  const replace = useReplace();
  const signedOut = !isResolving && !isUnavailable && operator === null;

  useEffect(() => {
    if (signedOut) replace(withParam(SIGN_IN_PATH, RETURN_TO_PARAM, pathname));
  }, [signedOut, pathname, replace]);

  if (isUnavailable) return <SessionUnavailable />;
  if (isResolving || !operator) return <ResolvingSession />;
  return <ConsoleShell>{children}</ConsoleShell>;
}

/** Chooses between the bare authentication layout and the full console. */
export function AppFrame({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  // `display: contents` so the authentication route is passed through with no box of its
  // own — the layout underneath already owns the page.
  if (pathname.startsWith(SIGN_IN_PATH)) return <div className="contents">{children}</div>;
  return <ConsoleRoute>{children}</ConsoleRoute>;
}
