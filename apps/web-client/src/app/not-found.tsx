import { Compass } from 'lucide-react';

import { EmptyState } from '@reliance/ui';

import { LinkButton } from '@/components/shell';
import { appRoutes } from '@/lib/routes';

/**
 * The 404.
 *
 * A customer who hits a dead end *inside their bank* does not read "page not found" as a routing
 * problem — they read it as something having happened to their account. So the first job here is
 * to say that nothing has, and the second is to put them one tap from the two screens they were
 * almost certainly heading for.
 *
 * No search box: this app has a command palette, and offering a second, worse search on the error
 * screen teaches people to distrust the good one.
 */
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <EmptyState
        icon={<Compass aria-hidden="true" className="size-6" />}
        title="That screen isn't here"
        description="The link may be out of date, or the address mistyped. Your accounts, payments and cards are all exactly where you left them."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <LinkButton href={appRoutes.dashboard}>Go to your accounts</LinkButton>
            <LinkButton href={appRoutes.support} variant="secondary">
              Message support
            </LinkButton>
          </div>
        }
      />
    </div>
  );
}
