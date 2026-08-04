'use client';

import { useActionState } from 'react';

import { Button, Checkbox, FieldError, FormField, Input } from '@reliance/ui';

import { subscribeNewsletterAction } from '@/lib/actions/contact-actions';
import { IDLE_FORM_STATE } from '@/lib/actions/form-state';

import { FormStatus } from './form-status';
import { HoneypotField } from './honeypot-field';

/**
 * Newsletter sign-up, as it appears in the footer.
 *
 * The consent box is unticked and required. A pre-ticked box is not consent, and a bank
 * of all places should not need telling twice.
 */
export function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeNewsletterAction, IDLE_FORM_STATE);

  return (
    <form action={action} className="relative mt-8 max-w-sm">
      <fieldset className="space-y-3 border-0 p-0" disabled={pending}>
        <legend className="text-fg mb-2 text-sm font-medium">Money insights, once a month</legend>

        <FormField label="Email address" error={state.fieldErrors.email} required>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </FormField>

        <div>
          <Checkbox name="consent" className="text-sm">
            Email me practical money guides. Unsubscribe from any of them in one click.
          </Checkbox>
          <FieldError>{state.fieldErrors.consent}</FieldError>
        </div>

        <HoneypotField />

        <Button type="submit" loading={pending} variant="secondary">
          Subscribe
        </Button>
      </fieldset>

      <FormStatus state={state} className="mt-3" />
    </form>
  );
}
