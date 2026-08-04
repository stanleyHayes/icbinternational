/**
 * `/platform/flags` — feature flags and maintenance mode.
 */

import type { Metadata } from 'next';

import { FlagsScreen } from './flags-screen';

export const metadata: Metadata = {
  title: 'Feature flags',
  description: 'Rollout percentages, segment targeting and maintenance mode.',
};

/** Feature flags. */
export default function FlagsPage() {
  return <FlagsScreen />;
}
