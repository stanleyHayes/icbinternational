import type { Metadata } from 'next';

import { openAccountRoute } from '@/components/accounts/routes';
import { LinkButton, PageHeader } from '@/components/shell';
import { appRoutes } from '@/lib/routes';
import { requireSession } from '@/lib/session';

import { AccountsScreen } from './accounts-screen';

export const metadata: Metadata = {
  title: 'Accounts',
  description: 'Every account you hold with us, with what you can spend on each.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/** Everything the customer holds with the bank. */
export default async function AccountsPage() {
  await requireSession(appRoutes.accounts);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        description="Everything you hold with us, and what you can spend on each one right now."
        actions={<LinkButton href={openAccountRoute}>Open an account</LinkButton>}
      />
      <AccountsScreen />
    </div>
  );
}
