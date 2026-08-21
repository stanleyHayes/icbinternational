'use client';

/**
 * The console's failure boundary.
 *
 * Written for the operator, not the customer. Two differences from the customer app's version.
 * It shows the digest: staff *can* act on a reference — it goes in the incident channel, and
 * withholding it just means someone screenshots the screen instead. And it does not reassure
 * anyone about their money, because the person reading this does not own the accounts on the
 * other side of the screen; what they need to know is whether the action they were mid-way
 * through went through, which is why it says plainly that it did not.
 */

import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

import { Button, ErrorState } from '@reliance/ui';

export default function ConsoleError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Picked up by the platform's error reporting; the digest below is the same reference.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <ErrorState
        title="This screen did not load"
        description="Nothing you were doing was saved, so no customer record has changed. Trying again usually works; if it does not, quote the reference below."
        {...(error.digest ? { reference: error.digest } : {})}
        action={
          <Button onClick={reset} startIcon={<RefreshCw aria-hidden="true" className="size-4" />}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
