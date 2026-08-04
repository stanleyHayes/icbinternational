'use client';

/**
 * The two consents, which are not the same kind of thing.
 *
 * Accepting the terms is a condition of opening an account, so it is required and it says so.
 * Marketing is a genuine choice, so it is unticked, separate, and worded as an offer rather than
 * as a formality — a pre-ticked marketing box is unlawful under UK e-privacy rules and, less
 * legalistically, a small lie about what the customer agreed to.
 */

import type { UseFormRegisterReturn } from 'react-hook-form';

import { FieldError, FormField, Switch, Checkbox } from '@reliance/ui';

const TERMS_URL = 'https://www.reliancebank.example/legal/terms';
const PRIVACY_URL = 'https://www.reliancebank.example/legal/privacy';

/** Props for {@link RegisterConsent}. */
export interface RegisterConsentProps {
  readonly termsError?: string;
  readonly termsRegistration: UseFormRegisterReturn;
  readonly marketingRegistration: UseFormRegisterReturn;
}

function LegalLink({ href, children }: { readonly href: string; readonly children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent font-medium underline underline-offset-2"
    >
      {children}
    </a>
  );
}

/** The terms checkbox and the marketing switch. */
export function RegisterConsent({
  termsError,
  termsRegistration,
  marketingRegistration,
}: RegisterConsentProps) {
  return (
    <div className="border-border bg-canvas flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1.5">
        <Checkbox {...termsRegistration} aria-invalid={termsError ? true : undefined}>
          <span className="text-sm">
            I accept the <LegalLink href={TERMS_URL}>account terms</LegalLink> and have read the{' '}
            <LegalLink href={PRIVACY_URL}>privacy notice</LegalLink>.
          </span>
        </Checkbox>
        <FieldError>{termsError}</FieldError>
      </div>

      <FormField
        label="Offers and product news"
        hint="Occasional email about rates, features and offers. You can turn this off at any time, and it never affects your account."
      >
        <Switch {...marketingRegistration}>Send me offers and product news</Switch>
      </FormField>
    </div>
  );
}
