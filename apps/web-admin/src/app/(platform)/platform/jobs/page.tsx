/**
 * `/platform/jobs` — the background job monitor.
 */

import type { Metadata } from 'next';

import { JobsScreen } from './jobs-screen';

export const metadata: Metadata = {
  title: 'Job monitor',
  description: 'Background runs, failures and replay of the dead-letter queue.',
};

/** The job monitor. */
export default function JobsPage() {
  return <JobsScreen />;
}
