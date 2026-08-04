'use client';

/**
 * What a route shows when it throws.
 *
 * Two rules a bank's error screen has to follow. It never shows the customer a code, a stack or a
 * message written for an engineer — the trace id is the only opaque string on the page, and it is
 * there because it is the thing support will ask for. And it never implies money was lost: a
 * screen that failed to *render* has not moved anything, and saying so plainly is the difference
 * between an annoyance and a phone call.
 *
 * Drop it into any `error.tsx`:
 *
 * ```tsx
 * 'use client';
 * import { RouteError } from '@/components/shell';
 * export default RouteError;
 * ```
 */

import { RefreshCw } from 'lucide-react';

import { Button, ErrorState } from '@reliance/ui';

import { describeError } from '@/lib/errors';
import { appRoutes } from '@/lib/routes';

import { LinkButton } from './link-button';

/** The props Next passes to an `error.tsx` boundary. */
export interface RouteErrorProps {
  readonly error: Error & { readonly digest?: string };
  /** Re-renders the segment. Next provides it; it is the only honest "try again". */
  readonly reset: () => void;
}

/** A full-width failure state for a route segment. */
export function RouteError({ error, reset }: RouteErrorProps) {
  const described = describeError(error);
  const reference = described.reference ?? error.digest ?? null;

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <ErrorState
        title={described.title}
        description={`${described.message} Nothing has been sent, and no money has moved.`}
        {...(reference ? { reference } : {})}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={reset} startIcon={<RefreshCw aria-hidden="true" className="size-4" />}>
              Try again
            </Button>
            <LinkButton href={appRoutes.dashboard} variant="secondary">
              Go to your accounts
            </LinkButton>
          </div>
        }
      />
    </div>
  );
}

export default RouteError;
