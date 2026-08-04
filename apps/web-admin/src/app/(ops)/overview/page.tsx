/**
 * `/overview` — the operations floor at a glance.
 *
 * The first screen of the shift. Everything on it is a question an operations manager
 * asks before they do anything else: does the book still balance, what is arriving, what
 * is waiting on a person, and is anything downstream broken.
 */

import type { Metadata } from 'next';

import { OverviewScreen } from './overview-screen';

export const metadata: Metadata = {
  title: 'Overview',
  description: 'Balances, volumes, queue depths and counterparty health across the bank.',
};

/** The operations overview. */
export default function OverviewPage() {
  return <OverviewScreen />;
}
