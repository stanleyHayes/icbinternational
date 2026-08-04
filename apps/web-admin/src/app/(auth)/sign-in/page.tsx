/**
 * `/sign-in`.
 *
 * The return path is read here, on the server, and validated before it reaches the
 * client. An unchecked `?next=` is an open redirect, and on a staff console the payoff
 * for one is a convincing sign-in page on somebody else's domain that the bank's own
 * link sent the operator to.
 */

import type { Metadata } from 'next';

import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

/** Where an operator goes when nothing better was asked for. */
const CONSOLE_ROOT = '/';

/**
 * Accepts only an absolute path inside this console.
 *
 * `//evil.example` and `https://evil.example` are both rejected: the first is a
 * protocol-relative URL that browsers treat as another origin, and it is the one that
 * gets missed.
 */
function safeReturnPath(value: string | string[] | undefined): string {
  if (typeof value !== 'string') return CONSOLE_ROOT;
  if (!value.startsWith('/') || value.startsWith('//')) return CONSOLE_ROOT;
  return value;
}

interface SignInPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Staff sign-in. */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  return <SignInForm returnTo={safeReturnPath(params.next)} />;
}
