import type { Metadata } from 'next';

import { StatusTracker } from '../../_components/status-tracker';

export const metadata: Metadata = {
  title: 'Your application',
  description: 'Track the progress of your Reliance Bank account application.',
};

/** The case is read per request. */
export const dynamic = 'force-dynamic';

/** The application tracker. */
export default function OnboardingStatusPage() {
  return <StatusTracker />;
}
