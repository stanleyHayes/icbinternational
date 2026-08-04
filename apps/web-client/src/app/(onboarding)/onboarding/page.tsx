import type { Metadata } from 'next';

import { WizardResume } from '../_components/wizard-resume';

export const metadata: Metadata = {
  title: 'Open your account',
  description: 'Finish opening your Reliance Bank account.',
};

/** Where the customer got to is read per request. */
export const dynamic = 'force-dynamic';

/** Sends the customer to the step they are on. */
export default function OnboardingPage() {
  return <WizardResume />;
}
