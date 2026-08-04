import type { Metadata } from 'next';

import { closeAccountRoute } from '@/components/accounts/routes';
import { PageHeader } from '@/components/shell';
import { requireSession } from '@/lib/session';

import { CloseScreen } from './close-screen';

export const metadata: Metadata = {
  title: 'Close an account',
  description: 'Move any remaining balance and close this account.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/** Route parameters. `params` is a promise from Next 15 onwards. */
interface PageProps {
  readonly params: Promise<{ readonly id: string }>;
}

/** Closing one account, with the balance moved somewhere first. */
export default async function CloseAccountPage({ params }: PageProps) {
  const { id: accountId } = await params;
  await requireSession(closeAccountRoute(accountId));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Close this account"
        description="We will move any remaining balance first. This cannot be undone."
      />
      <CloseScreen accountId={accountId} />
    </div>
  );
}
