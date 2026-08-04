/**
 * Step one: who you are.
 *
 * Real labels above the fields rather than placeholders inside them. A placeholder
 * disappears the moment somebody types, which means the only person who can see what a
 * field is for is the person who has not filled it in yet.
 */

'use client';

import type { FormEvent } from 'react';

import { Button, FormField, Input } from '@reliance/ui';

export interface CredentialsStepProps {
  readonly email: string;
  readonly onEmailChange: (email: string) => void;
  readonly password: string;
  readonly onPasswordChange: (password: string) => void;
  readonly onContinue: () => void;
}

function Heading() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-lg font-semibold">Sign in</h1>
      <p className="font-body text-fg-muted text-sm">
        Use your staff account. You will be asked for your authenticator code next.
      </p>
    </div>
  );
}

/** The email-and-password half of staff sign-in. */
export function CredentialsStep(props: CredentialsStepProps) {
  const ready = props.email.trim().length > 0 && props.password.length > 0;

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (ready) props.onContinue();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Heading />

      <FormField label="Work email address" required>
        <Input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={props.email}
          onChange={(event) => props.onEmailChange(event.target.value)}
        />
      </FormField>

      <FormField label="Password" required>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={props.password}
          onChange={(event) => props.onPasswordChange(event.target.value)}
        />
      </FormField>

      <Button type="submit" fullWidth disabled={!ready}>
        Continue
      </Button>
    </form>
  );
}
