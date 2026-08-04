'use client';

/**
 * A password field with a reveal control.
 *
 * The reveal exists because the alternative — silently mistyping a long password three times and
 * being locked out — is worse than the shoulder-surfing risk it introduces. The button announces
 * its *state*, not just its action, so a screen-reader user knows whether the characters are
 * currently visible.
 *
 * Ids and `aria-describedby` are left to `FormField`, which derives them; the control reads them
 * out of context. Setting them here would be a second, quieter source of truth for the same wiring.
 */

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { FormField, Input } from '@reliance/ui';

/** Props for {@link PasswordField}. */
export interface PasswordFieldProps {
  readonly label: string;
  /** What makes a valid password, shown before the customer types rather than after they fail. */
  readonly hint?: string;
  readonly error?: string;
  readonly autoComplete: 'current-password' | 'new-password';
  readonly registration: UseFormRegisterReturn;
}

/** A labelled password input. */
export function PasswordField({
  label,
  hint,
  error,
  autoComplete,
  registration,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const Icon = revealed ? EyeOff : Eye;

  return (
    <FormField label={label} hint={hint} error={error} required>
      <Input
        type={revealed ? 'text' : 'password'}
        autoComplete={autoComplete}
        {...registration}
        suffix={
          <button
            type="button"
            onClick={() => setRevealed((previous) => !previous)}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="text-fg-muted hover:text-fg focus-visible:ring-focus rounded-sm p-1 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        }
      />
    </FormField>
  );
}
