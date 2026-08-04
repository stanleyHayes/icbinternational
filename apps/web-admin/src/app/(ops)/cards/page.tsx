/**
 * `/cards` — card operations.
 */

import type { Metadata } from 'next';

import { CardsScreen } from './cards-screen';

export const metadata: Metadata = {
  title: 'Cards',
  description: 'Issue, freeze and reissue cards, and read the authorisation log.',
};

/** Card operations. */
export default function CardsPage() {
  return <CardsScreen />;
}
