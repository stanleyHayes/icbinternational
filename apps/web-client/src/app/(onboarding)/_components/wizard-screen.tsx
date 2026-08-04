'use client';

/**
 * One step of the wizard, guarded.
 *
 * The guard is what makes the wizard resumable. Progress belongs to the server, so the screen the
 * customer asked for is checked against the case before it is rendered: a step further ahead than
 * the bank has reached is redirected back to the furthest one they are allowed on, and a case that
 * has already been submitted goes to the tracker instead of a form that can no longer be answered.
 *
 * The consequence is the behaviour that matters — refresh anywhere, close the laptop, come back on
 * a phone, and you land on the same step with the same answers.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { KycStatus, type KycCase } from '@reliance/contracts';
import { SkeletonText } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { stepIndex, wizardStep, type WizardStep } from '@/lib/kyc-steps';
import { onboardingRoutes } from '@/lib/routes';

import { StepBody } from './step-body';
import { useKycCase, useStartKyc } from './use-kyc-case';
import { WizardFrame } from './wizard-frame';

/** Statuses where the case is out of the customer's hands and the tracker is the right screen. */
const CLOSED_TO_EDITS: ReadonlySet<KycStatus> = new Set([
  KycStatus.SUBMITTED,
  KycStatus.UNDER_REVIEW,
  KycStatus.APPROVED,
  KycStatus.REJECTED,
  KycStatus.EXPIRED,
]);

/** The furthest step the customer may open, given what the bank has accepted. */
function furthestAllowed(kycCase: KycCase): number {
  return kycCase.nextStep ? stepIndex(kycCase.nextStep) : stepIndex('REVIEW');
}

/** Props for {@link WizardScreen}. */
export interface WizardScreenProps {
  readonly current: WizardStep;
}

/** Loads the case, opens one if needed, and renders the requested step. */
export function WizardScreen({ current }: WizardScreenProps) {
  const router = useRouter();
  const { data: kycCase, isPending, error } = useKycCase();
  const start = useStartKyc();

  const notStarted = kycCase?.status === KycStatus.NOT_STARTED;
  const submitted = kycCase !== undefined && CLOSED_TO_EDITS.has(kycCase.status);
  const tooFar = kycCase !== undefined && stepIndex(current.step) > furthestAllowed(kycCase);

  useEffect(() => {
    if (notStarted && start.isIdle) start.mutate();
  }, [notStarted, start]);

  useEffect(() => {
    if (submitted) router.replace(onboardingRoutes.status);
  }, [submitted, router]);

  useEffect(() => {
    if (!kycCase || submitted || !tooFar) return;
    // A null `nextStep` means every step has been accepted, which is the review screen.
    router.replace(onboardingRoutes.step(wizardStep(kycCase.nextStep ?? 'REVIEW').slug));
  }, [kycCase, submitted, tooFar, router]);

  if (error) return <FormAlert error={error} title="We could not load your application" />;
  if (isPending || !kycCase || submitted || tooFar) return <SkeletonText lines={6} />;

  return (
    <WizardFrame current={current}>
      <StepBody step={current.step} kycCase={kycCase} />
    </WizardFrame>
  );
}
