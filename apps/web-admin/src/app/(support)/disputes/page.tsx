/**
 * `/disputes` — the chargeback and dispute console.
 */

import type { Metadata } from 'next';

import { DisputesConsole } from './disputes-console';

export const metadata: Metadata = {
  title: 'Disputes',
};

/** The dispute queue and case workspace. */
export default function DisputesPage() {
  return <DisputesConsole />;
}
