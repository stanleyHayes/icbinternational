/**
 * `/screening` — sanctions, PEP, adverse-media and watchlist adjudication.
 */

import type { Metadata } from 'next';

import { ScreeningConsole } from '@/components/compliance/screening/screening-console';

export const metadata: Metadata = {
  title: 'Screening',
};

/** The screening queue and comparison workstation. */
export default function ScreeningPage() {
  return <ScreeningConsole />;
}
