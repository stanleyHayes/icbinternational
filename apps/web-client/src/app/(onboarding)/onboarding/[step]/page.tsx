import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { stepFromSlug } from '@/lib/kyc-steps';

import { WizardScreen } from '../../_components/wizard-screen';

export const metadata: Metadata = {
  title: 'Open your account',
  description: 'Finish opening your Reliance Bank account.',
};

/** The case is read in the browser, and the URL segment decides the screen. */
export const dynamic = 'force-dynamic';

/**
 * One step of the account-opening wizard.
 *
 * The segment is resolved to a step here so an unknown one 404s rather than rendering an empty
 * frame. Whether the customer is *allowed* on the step is decided in the browser, against the case
 * the bank returns — the URL says which screen, the server says which is reachable.
 */
export default async function WizardStepPage({
  params,
}: {
  readonly params: Promise<{ readonly step: string }>;
}) {
  const { step } = await params;
  const entry = stepFromSlug(step);
  if (!entry) notFound();

  return <WizardScreen current={entry} />;
}
