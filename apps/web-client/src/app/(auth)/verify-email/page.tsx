import type { Metadata } from 'next';

import { firstParam, type SearchParams } from '@/lib/search-params';

import { VerifyEmailPanel } from './verify-email-panel';

export const metadata: Metadata = {
  title: 'Confirm your email',
  description: 'Confirm the email address on your Reliance Bank account.',
};

/** Reads the token from the emailed link. */
export const dynamic = 'force-dynamic';

/** Email confirmation, with or without a token. */
export default async function VerifyEmailPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <VerifyEmailPanel token={firstParam(params, 'token')} />;
}
