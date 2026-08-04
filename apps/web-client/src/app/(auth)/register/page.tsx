import type { Metadata } from 'next';

import { appRoutes } from '@/lib/routes';
import { redirectIfSignedIn } from '@/lib/session';

import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Open an account',
  description: 'Open a Reliance Bank current account online in a few minutes.',
};

/** Reads the session cookie. */
export const dynamic = 'force-dynamic';

/** Registration. */
export default async function RegisterPage() {
  await redirectIfSignedIn(appRoutes.dashboard);
  return <RegisterForm />;
}
