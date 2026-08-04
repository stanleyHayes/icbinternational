/**
 * `/` — where an operator lands.
 *
 * Deliberately not a redirect into whichever queue happens to be first. Roles differ
 * enough that any fixed landing screen is wrong for most of the staff, and a redirect
 * would also mean the console's root 404s for anyone whose permissions do not open that
 * particular screen.
 */

import type { Metadata } from 'next';

import { ConsoleHome } from '@/components/shell/console-home';

export const metadata: Metadata = {
  title: 'Home',
};

/** The console's launcher. */
export default function HomePage() {
  return <ConsoleHome />;
}
