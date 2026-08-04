import type { Metadata } from 'next';

import { RETURN_TO_PARAM, safeDestination } from '@/lib/routes';
import { firstParam, type SearchParams } from '@/lib/search-params';

import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = {
  title: 'Confirm it’s you',
  description: 'Complete the second security check to finish signing in.',
};

/** Reads the return-to parameter. */
export const dynamic = 'force-dynamic';

/**
 * The second-factor step.
 *
 * The challenge itself lives in the tab's own storage, not in the URL: a challenge id in a link
 * survives being pasted into a chat window, and this one should not outlive the tab it was issued
 * to.
 */
export default async function TwoFactorPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <TwoFactorForm destination={safeDestination(firstParam(params, RETURN_TO_PARAM))} />;
}
