/**
 * `/comms` — message templates and campaigns.
 */

import type { Metadata } from 'next';

import { CommsScreen } from './comms-screen';

export const metadata: Metadata = {
  title: 'Communications',
  description: 'Message templates, campaigns and delivery analytics.',
};

/** The communications studio. */
export default function CommsPage() {
  return <CommsScreen />;
}
