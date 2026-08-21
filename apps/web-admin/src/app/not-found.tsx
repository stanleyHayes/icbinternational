import { ShieldQuestion } from 'lucide-react';
import Link from 'next/link';

import { cn, EmptyState, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

/**
 * The console's 404.
 *
 * Worth writing separately from the customer app's, because a 404 means something different to
 * staff. An operator almost never mistypes a console URL — they arrive from a bookmark, a link
 * pasted into a ticket, or a deep link to a record. So the three things that actually produce
 * this screen are a record that has since been closed, a screen their role does not open, and a
 * route that has moved. Naming those is more useful than "check the address", and the
 * permissions case matters most: it is the one an operator would otherwise raise as a bug.
 *
 * It deliberately does not say which of the three it was. The console cannot distinguish a
 * missing record from one this operator may not see, and guessing would leak the existence of
 * records to staff whose role is scoped away from them.
 */
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <EmptyState
        icon={<ShieldQuestion aria-hidden="true" className="size-6" />}
        title="This screen isn't available to you"
        description="Either it does not exist, the record has been closed, or your role does not open it. If a colleague sent you this link, ask them which queue it came from."
        action={
          // A literal static route, so it needs no `href()` from `@/lib/routes` — that helper
          // exists for runtime-assembled paths, and it lives in a `'use client'` module, so
          // calling it from this server component fails the prerender.
          <Link
            href="/"
            className={cn(
              'border-border bg-surface hover:border-border-strong hover:bg-surface-raised ' +
                'text-fg font-body inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium',
              FOCUS_RING,
              TRANSITION_STATE,
            )}
          >
            Back to the console home
          </Link>
        }
      />
    </div>
  );
}
