import type { Metadata } from 'next';

import { statementsRoute } from '@/components/accounts/routes';
import { requireSession } from '@/lib/session';

import { StatementsScreen } from './statements-screen';

export const metadata: Metadata = {
  title: 'Statements',
  description: 'Download monthly statements for this account, kept for six years.',
};

/** Reads the session cookie, so it can never be prerendered. */
export const dynamic = 'force-dynamic';

/** Route parameters. `params` is a promise from Next 15 onwards. */
interface PageProps {
  readonly params: Promise<{ readonly id: string }>;
}

/** Every statement produced for one account. */
export default async function StatementsPage({ params }: PageProps) {
  const { id: accountId } = await params;
  await requireSession(statementsRoute(accountId));

  return (
    <div className="flex flex-col gap-6">
      <StatementsScreen accountId={accountId} />
    </div>
  );
}
