'use client';

/**
 * Date of birth and nationality.
 *
 * The age rule is checked in the browser as well as on the server, because "you have to be 18" is
 * something the customer can be told the moment they type it rather than after a round trip. The
 * server still decides; this only saves the wait.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField, Input, Select } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { nowMs } from '@/lib/clock';
import { COUNTRIES } from '@/lib/countries';
import { readDraft, saveDraft } from '@/lib/kyc-draft';

import { StepActions } from './step-actions';
import { useSubmitStep } from './use-kyc-case';
import { useStepNavigation } from './use-step-navigation';

const MINIMUM_AGE = 18;

function isOldEnough(isoDate: string): boolean {
  const birth = new Date(isoDate).getTime();
  if (Number.isNaN(birth)) return false;

  const cutoff = new Date(nowMs());
  cutoff.setFullYear(cutoff.getFullYear() - MINIMUM_AGE);
  return birth <= cutoff.getTime();
}

const formSchema = z.object({
  dateOfBirth: z
    .string()
    .min(1, 'Enter your date of birth.')
    .refine(isOldEnough, `You need to be ${MINIMUM_AGE} or over to open an account with us.`),
  nationality: z.string().length(2, 'Choose your nationality.'),
});

type FormValues = z.infer<typeof formSchema>;

/** The first step of the wizard. */
export function IdentityStep() {
  const draft = readDraft();
  const submitStep = useSubmitStep();
  const navigation = useStepNavigation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { dateOfBirth: draft.dateOfBirth ?? '', nationality: draft.nationality ?? 'GB' },
  });

  async function submit(values: FormValues): Promise<void> {
    saveDraft(values);
    const updated = await submitStep.mutateAsync({
      step: 'IDENTITY',
      body: { step: 'IDENTITY', dateOfBirth: values.dateOfBirth, nationality: values.nationality },
    });
    navigation.advance(updated);
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)}>
      <div className="flex flex-col gap-5">
        <FormAlert error={submitStep.error} />

        <FormField
          label="Date of birth"
          hint="As it appears on the ID you are going to show us."
          error={form.formState.errors.dateOfBirth?.message}
          required
        >
          <Input type="date" autoComplete="bday" {...form.register('dateOfBirth')} />
        </FormField>

        <FormField label="Nationality" error={form.formState.errors.nationality?.message} required>
          <Select options={COUNTRIES} {...form.register('nationality')} />
        </FormField>
      </div>

      <StepActions submitLabel="Continue" busy={form.formState.isSubmitting} />
    </form>
  );
}
