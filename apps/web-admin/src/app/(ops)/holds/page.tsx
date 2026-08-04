/**
 * `/holds` — the hold register.
 */

import type { Metadata } from 'next';

import { HoldsScreen } from './holds-screen';

export const metadata: Metadata = {
  title: 'Holds',
  description: 'Liens, court orders and compliance freezes across the book.',
};

/** The hold register. */
export default function HoldsPage() {
  return <HoldsScreen />;
}
