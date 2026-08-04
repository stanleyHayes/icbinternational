'use client';

/**
 * The fields of the sign-in form.
 *
 * Separated from the submission logic so each can be read on its own — the interesting parts of
 * this screen are the failure routing and the enumeration-safe messaging, and neither is easy to
 * see through eighty lines of markup.
 */

import Link from 'next/link';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { Checkbox, FormField, Input } from '@reliance/ui';

import { authRoutes } from '@/lib/routes';

import { PasswordField } from '../_components/password-field';

/** Props for {@link SignInFields}. */
export interface SignInFieldsProps {
  readonly email: UseFormRegisterReturn;
  readonly password: UseFormRegisterReturn;
  readonly rememberDevice: UseFormRegisterReturn;
  readonly emailError?: string;
  readonly passwordError?: string;
}

/** Email, password, the forgotten-password link and the remember-device choice. */
export function SignInFields(props: SignInFieldsProps) {
  const { email, password, rememberDevice, emailError, passwordError } = props;

  return (
    <>
      <FormField label="Email address" error={emailError} required>
        <Input type="email" inputMode="email" autoComplete="username" {...email} />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <PasswordField
          label="Password"
          autoComplete="current-password"
          error={passwordError}
          registration={password}
        />
        <Link
          href={authRoutes.forgotPassword}
          className="text-accent self-end text-sm font-medium hover:underline"
        >
          Forgotten your password?
        </Link>
      </div>

      <Checkbox {...rememberDevice}>Remember this device for 30 days</Checkbox>
    </>
  );
}
