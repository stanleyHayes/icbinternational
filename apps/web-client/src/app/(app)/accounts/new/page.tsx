import type { Metadata } from 'next';

import { OpenAccountForm } from '@/components/accounts/open-account-form';
import { openAccountRoute } from '@/components/accounts/routes';
import { PageHeader } from '@/components/shell';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Open an account',
  description: 'Add a current account, a saver or a currency wallet in a couple of minutes.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/** Opening another account against an existing profile. */
export default async function OpenAccountPage() {
  await requireSession(openAccountRoute);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Open an account"
        description="Because we already know who you are, this takes about two minutes and you get the sort code and account number straight away."
      />
      <OpenAccountForm />
    </div>
  );
}
