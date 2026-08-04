'use client';

/**
 * Moving between wizard steps.
 *
 * Forward navigation follows the server's `nextStep`, never a local counter. Backward navigation
 * walks the declared order, because "the step before this one" is a property of the wizard rather
 * than of the case.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import type { KycCase, KycStep } from '@reliance/contracts';

import { stepIndex, WIZARD_STEPS, wizardStep } from '@/lib/kyc-steps';
import { onboardingRoutes } from '@/lib/routes';

/** What {@link useStepNavigation} hands back. */
export interface StepNavigation {
  /** Follows the case's own `nextStep`, or the status tracker when there is none left. */
  readonly advance: (kycCase: KycCase) => void;
  /** Goes to the previous step in the declared order. */
  readonly back: (from: KycStep) => void;
  /** Jumps to a named step — used by the review screen's "change this" links. */
  readonly goTo: (step: KycStep) => void;
}

/** Navigation helpers for the wizard. */
export function useStepNavigation(): StepNavigation {
  const router = useRouter();

  const goTo = useCallback(
    (step: KycStep) => router.push(onboardingRoutes.step(wizardStep(step).slug)),
    [router],
  );

  const advance = useCallback(
    (kycCase: KycCase) => {
      const next = kycCase.nextStep;
      router.push(next ? onboardingRoutes.step(wizardStep(next).slug) : onboardingRoutes.status);
    },
    [router],
  );

  const back = useCallback(
    (from: KycStep) => {
      const previous = WIZARD_STEPS[stepIndex(from) - 1];
      if (previous) router.push(onboardingRoutes.step(previous.slug));
    },
    [router],
  );

  return { advance, back, goTo };
}
