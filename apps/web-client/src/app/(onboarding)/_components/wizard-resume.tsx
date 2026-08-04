'use client';

/**
 * The wizard's front door.
 *
 * `/onboarding` never renders a form of its own. It asks the bank where the customer got to and
 * forwards them there, which is what makes the address bookmarkable: the same link is "start" on
 * day one and "carry on from where you were" on day three.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { KycStatus } from '@reliance/contracts';
import { SkeletonText } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { wizardStep } from '@/lib/kyc-steps';
import { onboardingRoutes } from '@/lib/routes';

import { useKycCase, useStartKyc } from './use-kyc-case';

/** Redirects to whichever screen the customer belongs on. */
export function WizardResume() {
  const router = useRouter();
  const { data: kycCase, error } = useKycCase();
  const start = useStartKyc();

  useEffect(() => {
    if (kycCase?.status === KycStatus.NOT_STARTED && start.isIdle) start.mutate();
  }, [kycCase?.status, start]);

  useEffect(() => {
    if (!kycCase || kycCase.status === KycStatus.NOT_STARTED) return;
    if (!kycCase.nextStep) {
      router.replace(onboardingRoutes.status);
      return;
    }
    router.replace(onboardingRoutes.step(wizardStep(kycCase.nextStep).slug));
  }, [kycCase, router]);

  if (error) return <FormAlert error={error} title="We could not load your application" />;
  return <SkeletonText lines={6} />;
}
