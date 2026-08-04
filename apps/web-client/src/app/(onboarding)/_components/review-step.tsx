'use client';

/**
 * Read it back before it goes.
 *
 * The summary is built from `profile.get` — what the *bank* holds — not from the drafts this
 * browser kept. A review screen that reads back the customer's own typing confirms nothing; it has
 * to confirm what was actually received.
 */

import { useQuery } from '@tanstack/react-query';

import type { KycCase } from '@reliance/contracts';
import { Alert, SkeletonText } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

import { ReviewSummary } from './review-summary';
import { StepActions } from './step-actions';
import { useSubmitCase } from './use-kyc-case';
import { useStepNavigation } from './use-step-navigation';

const SUBMIT_NOTE =
  'Once submitted, our team reviews it. You will not be able to change these answers.';

/** Props for {@link ReviewStep}. */
export interface ReviewStepProps {
  readonly kycCase: KycCase;
}

function Assurances() {
  return (
    <>
      <Alert tone="info" title="What happens next">
        Most applications are decided within a few minutes. We will email you either way, and you
        can watch the progress on the next screen.
      </Alert>

      <p className="text-fg-muted text-sm">
        By submitting, you confirm that everything above is accurate and that the documents you have
        sent are your own.
      </p>
    </>
  );
}

/** The summary and the submit control. */
export function ReviewStep({ kycCase }: ReviewStepProps) {
  const navigation = useStepNavigation();
  const submitCase = useSubmitCase();

  const { data: profile, isPending } = useQuery({
    queryKey: queryKeys.profile,
    queryFn: async () => (await browserApi().profile.get()).data,
  });

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    navigation.advance(await submitCase.mutateAsync());
  }

  if (isPending || !profile) return <SkeletonText lines={8} />;

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <div className="flex flex-col gap-5">
        <FormAlert error={submitCase.error} />
        <ReviewSummary profile={profile} kycCase={kycCase} onChange={navigation.goTo} />
        <Assurances />
      </div>

      <StepActions
        submitLabel="Submit my application"
        busy={submitCase.isPending}
        onBack={() => navigation.back('REVIEW')}
        note={SUBMIT_NOTE}
      />
    </form>
  );
}
