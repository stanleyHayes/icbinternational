import type { Metadata } from 'next';

import { firstParam, type SearchParams } from '@/lib/search-params';

import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your Reliance Bank account.',
};

/** Reads the token from the emailed link. */
export const dynamic = 'force-dynamic';

/** Completing a password reset. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <ResetPasswordForm token={firstParam(params, 'token')} />;
}
