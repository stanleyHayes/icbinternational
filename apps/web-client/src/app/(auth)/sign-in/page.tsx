import type { Metadata } from 'next';

import { REASON_PARAM, RETURN_TO_PARAM, safeDestination } from '@/lib/routes';
import { firstParam, type SearchParams } from '@/lib/search-params';
import { redirectIfSignedIn } from '@/lib/session';

import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Reliance Bank accounts.',
};

/** Reads cookies and query parameters, so it is never prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Sign in.
 *
 * The `?next=` value is narrowed before it is used or handed to the form. An open redirect on a
 * bank's sign-in page is a phishing kit with the bank's own domain in the address bar.
 */
export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const destination = safeDestination(firstParam(params, RETURN_TO_PARAM));

  await redirectIfSignedIn(destination);

  return <SignInForm destination={destination} reason={firstParam(params, REASON_PARAM)} />;
}
