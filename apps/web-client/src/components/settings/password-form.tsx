'use client';

/**
 * Changing the password.
 *
 * Changing it revokes every other session, which is the point — somebody changing their password
 * is very often doing it because they think another session exists. The screen says so before the
 * button, so nobody is surprised to be signed out on their laptop.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { PASSWORD_MIN_LENGTH } from '@reliance/contracts';
import { Alert, Button, FormField, Input } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

/** Why the new password cannot be used, or null. */
function problemWith(next: string, confirmation: string): string | null {
  if (next.length < PASSWORD_MIN_LENGTH) {
    return `Your new password needs at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (next !== confirmation) return 'The two new passwords do not match.';
  return null;
}

/**
 * @example <PasswordForm />
 */
export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);

  const change = useMutation({
    mutationFn: async () =>
      browserApi().auth.changePassword({ currentPassword: current, newPassword: next }),
  });

  const problem = problemWith(next, confirmation);

  const submit = (): void => {
    setTouched(true);
    if (!problem && current) change.mutate();
  };

  return (
    <Section title="Password" description="Changing it signs you out everywhere else.">
      <div className="flex flex-col gap-4">
        <FormAlert error={change.error} />
        {change.isSuccess ? <Changed /> : null}

        <PasswordFields
          current={current}
          next={next}
          confirmation={confirmation}
          problem={touched ? problem : null}
          onCurrent={setCurrent}
          onNext={setNext}
          onConfirmation={setConfirmation}
        />

        <div className="flex justify-end">
          <Button loading={change.isPending} onClick={submit}>
            Change my password
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** The confirmation, announced. */
function Changed() {
  return (
    <div role="status" aria-live="polite">
      <Alert tone="success" title="Password changed">
        Every other device has been signed out. You will need the new password there.
      </Alert>
    </div>
  );
}

/** Props for {@link PasswordFields}. */
interface PasswordFieldsProps {
  readonly current: string;
  readonly next: string;
  readonly confirmation: string;
  readonly problem: string | null;
  readonly onCurrent: (value: string) => void;
  readonly onNext: (value: string) => void;
  readonly onConfirmation: (value: string) => void;
}

/** The three boxes, each with the autocomplete token a password manager expects. */
function PasswordFields(props: PasswordFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <FormField label="Your current password" required>
        <Input
          type="password"
          autoComplete="current-password"
          value={props.current}
          onChange={(event) => props.onCurrent(event.target.value)}
        />
      </FormField>

      <FormField
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. Length matters more than symbols.`}
        required
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={props.next}
          onChange={(event) => props.onNext(event.target.value)}
        />
      </FormField>

      <FormField label="New password again" error={props.problem ?? undefined} required>
        <Input
          type="password"
          autoComplete="new-password"
          value={props.confirmation}
          onChange={(event) => props.onConfirmation(event.target.value)}
        />
      </FormField>
    </div>
  );
}
