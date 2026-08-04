'use client';

/**
 * The selfie.
 *
 * Says what the photo is for before asking for it. "Take a selfie" from a bank, with no
 * explanation, is the single most suspicious-looking request in the whole flow — and it is the one
 * a customer is most likely to abandon at.
 */

import { useState } from 'react';

import { DocumentKind, type CustomerDocument, type KycCase } from '@reliance/contracts';
import { Alert } from '@reliance/ui';

import { FormAlert } from '@/components/shell';

import { CaptureGuidance } from './capture-guidance';
import { DocumentCapture } from './document-capture';
import { StepActions } from './step-actions';
import { useSubmitStep } from './use-kyc-case';
import { useStepNavigation } from './use-step-navigation';

const GUIDANCE: readonly string[] = [
  'Face the camera straight on, in even light.',
  'Take off hats, sunglasses and anything covering your face.',
  'Ordinary glasses are fine.',
];

const WHY =
  'We compare this photo with the one on your ID. It confirms the document belongs to you, and it ' +
  'is the check that stops somebody opening an account in your name with a stolen passport. It is ' +
  'never used for anything else.';

function existingSelfie(kycCase: KycCase): CustomerDocument | undefined {
  return kycCase.documents.find((document) => document.kind === DocumentKind.SELFIE);
}

/** Props for {@link LivenessStep}. */
export interface LivenessStepProps {
  readonly kycCase: KycCase;
}

/** Capturing a photo of the customer's face. */
export function LivenessStep({ kycCase }: LivenessStepProps) {
  const submitStep = useSubmitStep();
  const navigation = useStepNavigation();
  const [selfie, setSelfie] = useState<CustomerDocument | undefined>(existingSelfie(kycCase));

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selfie) return;
    const updated = await submitStep.mutateAsync({
      step: 'LIVENESS',
      body: { step: 'LIVENESS', selfieDocumentId: selfie.id },
    });
    navigation.advance(updated);
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <div className="flex flex-col gap-5">
        <FormAlert error={submitStep.error} />

        <Alert tone="info" title="Why we ask for this">
          {WHY}
        </Alert>

        <DocumentCapture
          kind={DocumentKind.SELFIE}
          label="A clear photo of your face"
          camera="user"
          existing={selfie}
          onUploaded={setSelfie}
          onRemove={() => setSelfie(undefined)}
        />

        <CaptureGuidance points={GUIDANCE} />
      </div>

      <StepActions
        submitLabel="Continue"
        busy={submitStep.isPending}
        disabled={!selfie}
        onBack={() => navigation.back('LIVENESS')}
      />
    </form>
  );
}
