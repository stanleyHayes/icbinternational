'use client';

/**
 * The fields of the registration form.
 *
 * Only what is needed to create a login. Everything else — date of birth, address, employment,
 * identity documents — belongs to the onboarding wizard, where it can be explained and saved a
 * step at a time. Asking for it here produces one long form nobody finishes.
 */

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { z } from 'zod';

import type { registerRequestSchema } from '@reliance/contracts';
import { FormField, Input } from '@reliance/ui';

import { PasswordField } from '../_components/password-field';

const PASSWORD_HINT =
  'At least 12 characters, with an uppercase letter, a lowercase letter and a number.';

type Values = z.input<typeof registerRequestSchema>;

/** Props for {@link RegisterFields}. */
export interface RegisterFieldsProps {
  readonly register: UseFormRegister<Values>;
  readonly errors: FieldErrors<Values>;
}

function NameRow({ register, errors }: RegisterFieldsProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField label="First name" error={errors.firstName?.message} required>
        <Input autoComplete="given-name" {...register('firstName')} />
      </FormField>
      <FormField label="Last name" error={errors.lastName?.message} required>
        <Input autoComplete="family-name" {...register('lastName')} />
      </FormField>
    </div>
  );
}

/** Name, email, phone and password. */
export function RegisterFields({ register, errors }: RegisterFieldsProps) {
  return (
    <>
      <NameRow register={register} errors={errors} />

      <FormField
        label="Email address"
        hint="We will send a link here to confirm it is yours."
        error={errors.email?.message}
        required
      >
        <Input type="email" inputMode="email" autoComplete="email" {...register('email')} />
      </FormField>

      <FormField
        label="Mobile number"
        hint="Optional now, required before you can send money. Include the country code."
        error={errors.phone?.message}
      >
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+44 7700 900123"
          {...register('phone')}
        />
      </FormField>

      <PasswordField
        label="Password"
        hint={PASSWORD_HINT}
        autoComplete="new-password"
        error={errors.password?.message}
        registration={register('password')}
      />
    </>
  );
}
