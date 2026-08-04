/**
 * `/lending/arrears` — the arrears dashboard and collections queue.
 */

import type { Metadata } from 'next';

import { ArrearsScreen } from './arrears-screen';

export const metadata: Metadata = {
  title: 'Arrears',
  description: 'Loans behind schedule, collections and write-off.',
};

/** Arrears and collections. */
export default function ArrearsPage() {
  return <ArrearsScreen />;
}
