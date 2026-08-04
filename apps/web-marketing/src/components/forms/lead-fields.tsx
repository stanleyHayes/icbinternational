'use client';

import { Checkbox, FieldError, FormField, Input, Select, Textarea } from '@reliance/ui';

import type { FieldErrors } from '@/lib/actions/form-state';

/** The longest message the contract accepts. */
export const MESSAGE_MAX_LENGTH = 500;

/** Matches the contract's `interest` enum. Labels are what a customer would call each one. */
const INTERESTS = [
  { value: 'PERSONAL', label: 'Personal banking' },
  { value: 'BUSINESS', label: 'Business banking' },
  { value: 'MORTGAGE', label: 'Mortgages' },
  { value: 'INVESTMENT', label: 'Savings and investments' },
  { value: 'CAREERS', label: 'Working at Reliance Bank' },
  { value: 'PRESS', label: 'Press and media' },
] as const;

function ConsentField({ error }: { readonly error: string | undefined }) {
  return (
    <div className="sm:col-span-2">
      <Checkbox name="consent" className="text-sm">
        I am happy for Reliance Bank to use these details to answer my enquiry. We keep them for two
        years and never sell them.
      </Checkbox>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/**
 * The enquiry fields.
 *
 * The phone field is marked optional in words, not with an asterisk: an asterisk tells a
 * screen-reader user nothing, and a legend explaining it is one more thing to find.
 */
export function LeadFields({ errors }: { readonly errors: FieldErrors }) {
  return (
    <>
      <FormField label="Full name" error={errors.name} required className="sm:col-span-2">
        <Input name="name" autoComplete="name" required maxLength={120} />
      </FormField>

      <FormField label="Email address" error={errors.email} required>
        <Input name="email" type="email" autoComplete="email" required />
      </FormField>

      <FormField
        label="Phone number"
        hint="Optional. Include the country code, for example +44 7700 900123."
        error={errors.phone}
      >
        <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" />
      </FormField>

      <FormField
        label="What is your enquiry about?"
        error={errors.interest}
        required
        className="sm:col-span-2"
      >
        <Select name="interest" required options={INTERESTS} defaultValue="PERSONAL" />
      </FormField>

      <FormField
        label="How can we help?"
        hint={`Up to ${String(MESSAGE_MAX_LENGTH)} characters. Please do not include card numbers, passwords or passcodes.`}
        error={errors.message}
        className="sm:col-span-2"
      >
        <Textarea name="message" rows={5} maxLength={MESSAGE_MAX_LENGTH} />
      </FormField>

      <ConsentField error={errors.consent} />
    </>
  );
}
