/**
 * `/finance/trial-balance` — the proof that the book foots.
 */

import type { Metadata } from 'next';

import { TrialBalanceScreen } from './trial-balance-screen';

export const metadata: Metadata = {
  title: 'Trial balance',
  description: 'Every general-ledger account, proving the book sums to zero.',
};

/** The trial balance. */
export default function TrialBalancePage() {
  return <TrialBalanceScreen />;
}
