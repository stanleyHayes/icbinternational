/**
 * `/lending/applications` — the underwriting queue.
 */

import type { Metadata } from 'next';

import { ApplicationsScreen } from './applications-screen';

export const metadata: Metadata = {
  title: 'Lending applications',
  description: 'Underwriting queue, affordability assessment and offer decisions.',
};

/** The underwriting queue. */
export default function LendingApplicationsPage() {
  return <ApplicationsScreen />;
}
