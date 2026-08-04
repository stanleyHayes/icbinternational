'use client';

import { useActionState } from 'react';

import { Button } from '@reliance/ui';

import { submitLeadAction } from '@/lib/actions/contact-actions';
import { IDLE_FORM_STATE } from '@/lib/actions/form-state';

import { FormStatus } from './form-status';
import { HoneypotField } from './honeypot-field';
import { LeadFields } from './lead-fields';

/**
 * The contact form.
 *
 * Validated by the contract's own schema on the server, so the rules the customer meets
 * here are the rules the API applies — there is no second, drifting copy in the browser.
 * The whole fieldset is disabled once it has been sent, so an impatient second click
 * cannot raise a duplicate enquiry.
 */
export function LeadForm() {
  const [state, action, pending] = useActionState(submitLeadAction, IDLE_FORM_STATE);
  const submitted = state.status === 'success';

  return (
    <form action={action} className="relative">
      <FormStatus state={state} className="mb-6" />

      <fieldset className="grid gap-5 border-0 p-0 sm:grid-cols-2" disabled={pending || submitted}>
        <legend className="sr-only">Your details</legend>

        <LeadFields errors={state.fieldErrors} />
        <HoneypotField />

        <div className="sm:col-span-2">
          <Button type="submit" size="lg" loading={pending}>
            Send enquiry
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
