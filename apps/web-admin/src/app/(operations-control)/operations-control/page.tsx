/**
 * `/operations-control` — the back-office control console.
 */

import type { Metadata } from 'next';

import { OperationsControlScreen } from './operations-control-screen';

export const metadata: Metadata = {
  title: 'Operations control',
  description:
    'Business date, batch processing, rail configuration, exchange rates and treasury funding.',
};

/** Operations control. */
export default function OperationsControlPage() {
  return <OperationsControlScreen />;
}
