'use client';

/**
 * The customer's own details.
 *
 * Changing an address can move somebody's risk rating, which is why the API may answer
 * `KYC_PENDING_REVIEW` rather than applying it outright — and why the screen says so before the
 * customer presses save rather than afterwards.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Address, Profile, UpdateProfileRequest } from '@reliance/contracts';
import { Alert, Button, FormField, Input, Select } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { COUNTRIES } from '@/lib/countries';
import { queryKeys } from '@/lib/query-keys';

const EMPTY_ADDRESS: Address = { line1: '', city: '', postalCode: '', country: 'GB' };

/** Saves the profile and refreshes everything that reads it. */
function useSaveProfile() {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: UpdateProfileRequest) =>
      (await browserApi().profile.update(body)).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}

/** Props for {@link AddressFields}. */
interface AddressFieldsProps {
  readonly address: Address;
  readonly onChange: (patch: Partial<Address>) => void;
}

/** A UK-shaped address, with the country still asked for. */
function AddressFields({ address, onChange }: AddressFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField className="sm:col-span-2" label="Address line 1" required>
        <Input
          value={address.line1}
          autoComplete="address-line1"
          onChange={(event) => onChange({ line1: event.target.value })}
        />
      </FormField>

      <FormField className="sm:col-span-2" label="Address line 2">
        <Input
          value={address.line2 ?? ''}
          autoComplete="address-line2"
          onChange={(event) => onChange({ line2: event.target.value })}
        />
      </FormField>

      <TownAndPostcode address={address} onChange={onChange} />

      <FormField className="sm:col-span-2" label="Country" required>
        <Select
          options={COUNTRIES}
          value={address.country}
          onChange={(event) => onChange({ country: event.target.value })}
        />
      </FormField>
    </div>
  );
}

/** The two fields a delivery depends on, kept together because they are checked together. */
function TownAndPostcode({ address, onChange }: AddressFieldsProps) {
  return (
    <>
      <FormField label="Town or city" required>
        <Input
          value={address.city}
          autoComplete="address-level2"
          onChange={(event) => onChange({ city: event.target.value })}
        />
      </FormField>

      <FormField label="Postcode" required>
        <Input
          value={address.postalCode}
          autoComplete="postal-code"
          onChange={(event) => onChange({ postalCode: event.target.value })}
        />
      </FormField>
    </>
  );
}

function ProfileFields({ profile }: { readonly profile: Profile }) {
  const [address, setAddress] = useState<Address>(profile.address ?? EMPTY_ADDRESS);
  const save = useSaveProfile();

  return (
    <div className="flex flex-col gap-5">
      <FormAlert error={save.error} />

      <Alert tone="info" title="Changing your address">
        We may need to check a new address against our records before it takes effect. If we do, we
        will tell you here and it usually takes a few minutes.
      </Alert>

      <AddressFields
        address={address}
        onChange={(patch) => setAddress((current) => ({ ...current, ...patch }))}
      />

      <div className="flex justify-end">
        <Button loading={save.isPending} onClick={() => save.mutate({ address })}>
          Save my address
        </Button>
      </div>
    </div>
  );
}

/**
 * @example <ProfileForm />
 */
export function ProfileForm() {
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: async () => (await browserApi().profile.get()).data,
  });

  return (
    <Section title="Where you live" description="The address we hold for you.">
      <QueryPanel query={profile} skeletonRows={3}>
        {(data) => <ProfileFields profile={data} />}
      </QueryPanel>
    </Section>
  );
}
