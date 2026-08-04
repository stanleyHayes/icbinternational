'use client';

/**
 * Home address.
 *
 * Free-text lines rather than a postcode lookup, deliberately: a lookup that cannot find an address
 * leaves the customer with no way forward at all, and the addresses it cannot find are
 * disproportionately new builds, sub-divided flats and shared housing.
 *
 * The country is asked last because it changes what the rest of the fields mean, and answering it
 * first is not how anyone writes down where they live.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { addressSchema } from '@reliance/contracts';
import { FormField, Input, Select } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { COUNTRIES } from '@/lib/countries';
import { readDraft, saveDraft } from '@/lib/kyc-draft';

import { StepActions } from './step-actions';
import { useSubmitStep } from './use-kyc-case';
import { useStepNavigation } from './use-step-navigation';

type FormValues = z.infer<typeof addressSchema>;

function rememberAddress(address: FormValues): void {
  saveDraft({
    addressLine1: address.line1,
    addressLine2: address.line2,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    country: address.country,
  });
}

function AddressFields({ form }: { readonly form: UseFormReturn<FormValues> }) {
  const { errors } = form.formState;

  return (
    <>
      <FormField label="Address line 1" error={errors.line1?.message} required>
        <Input autoComplete="address-line1" {...form.register('line1')} />
      </FormField>

      <FormField label="Address line 2" hint="Optional." error={errors.line2?.message}>
        <Input autoComplete="address-line2" {...form.register('line2')} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Town or city" error={errors.city?.message} required>
          <Input autoComplete="address-level2" {...form.register('city')} />
        </FormField>
        <FormField label="County or region" hint="Optional." error={errors.region?.message}>
          <Input autoComplete="address-level1" {...form.register('region')} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Postcode" error={errors.postalCode?.message} required>
          <Input autoComplete="postal-code" {...form.register('postalCode')} />
        </FormField>
        <FormField label="Country" error={errors.country?.message} required>
          <Select options={COUNTRIES} autoComplete="country" {...form.register('country')} />
        </FormField>
      </div>
    </>
  );
}

/** Street, town, postcode and country. */
export function AddressStep() {
  const draft = readDraft();
  const submitStep = useSubmitStep();
  const navigation = useStepNavigation();

  const form = useForm<FormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      line1: draft.addressLine1 ?? '',
      line2: draft.addressLine2 ?? '',
      city: draft.city ?? '',
      region: draft.region ?? '',
      postalCode: draft.postalCode ?? '',
      country: draft.country ?? 'GB',
    },
  });

  async function submit(address: FormValues): Promise<void> {
    rememberAddress(address);
    navigation.advance(
      await submitStep.mutateAsync({ step: 'ADDRESS', body: { step: 'ADDRESS', address } }),
    );
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)}>
      <div className="flex flex-col gap-5">
        <FormAlert error={submitStep.error} />
        <AddressFields form={form} />
      </div>

      <StepActions
        submitLabel="Continue"
        busy={form.formState.isSubmitting}
        onBack={() => navigation.back('ADDRESS')}
      />
    </form>
  );
}
