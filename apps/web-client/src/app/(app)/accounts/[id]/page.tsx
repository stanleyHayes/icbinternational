import type { Metadata } from 'next';

import { accountRoute } from '@/components/accounts/routes';
import { PageHeader } from '@/components/shell';
import { requireSession } from '@/lib/session';

import { AccountScreen } from './account-screen';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Your balance, recent activity and the details someone needs to pay you.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/** Route parameters. `params` is a promise from Next 15 onwards. */
interface PageProps {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * One account.
 *
 * The heading stays "Account" rather than becoming the account's name once it loads: a heading
 * that changes after the first paint moves everything underneath it, and the name is already the
 * first thing inside the balance block.
 */
export default async function AccountPage({ params }: PageProps) {
  const { id: accountId } = await params;
  await requireSession(accountRoute(accountId));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Account"
        description="What you can spend, what has moved, and the details to give someone paying you."
      />
      <AccountScreen accountId={accountId} />
    </div>
  );
}
