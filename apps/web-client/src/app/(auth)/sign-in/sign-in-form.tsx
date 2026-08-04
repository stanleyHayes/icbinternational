'use client';

/**
 * The sign-in screen.
 *
 * Credentials, a passkey alternative, and the two links out. The routing of a refusal and the
 * enumeration-safe messaging both live in `useSignIn`; the fields live in `SignInFields`.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import type { Route } from 'next';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { emailSchema } from '@reliance/contracts';
import { Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { authRoutes } from '@/lib/routes';

import { AuthCard } from '../_components/auth-card';
import { PasskeySignIn } from '../_components/passkey-sign-in';

import { SignInFields } from './sign-in-fields';
import { SignInReasonNotice } from './sign-in-reason';
import { useSignIn } from './use-sign-in';

const formSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
  rememberDevice: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

/** Props for {@link SignInForm}. */
export interface SignInFormProps {
  /** Where to go once signed in. Already narrowed to a same-origin path. */
  readonly destination: Route;
  /** Why the customer is here, if they were sent. */
  readonly reason: string | null;
}

function Footer() {
  return (
    <>
      New to Reliance Bank?{' '}
      <Link href={authRoutes.register} className="text-accent font-medium hover:underline">
        Open an account
      </Link>
    </>
  );
}

/** Email and password, with a passkey alternative. */
export function SignInForm({ destination, reason }: SignInFormProps) {
  const signIn = useSignIn(destination);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '', rememberDevice: false },
  });

  return (
    <AuthCard
      title="Sign in"
      description="Use the email address you registered with."
      footer={<Footer />}
    >
      <form noValidate onSubmit={form.handleSubmit(signIn.attempt)} className="flex flex-col gap-5">
        <SignInReasonNotice reason={reason} />
        <FormAlert error={signIn.failure} />

        <SignInFields
          email={form.register('email')}
          password={form.register('password')}
          rememberDevice={form.register('rememberDevice')}
          emailError={form.formState.errors.email?.message}
          passwordError={form.formState.errors.password?.message}
        />

        <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
          Sign in
        </Button>

        <div className="text-fg-subtle flex items-center gap-3 text-xs tracking-wide uppercase">
          <span aria-hidden="true" className="bg-border h-px flex-1" />
          or
          <span aria-hidden="true" className="bg-border h-px flex-1" />
        </div>

        <PasskeySignIn onSignedIn={signIn.arrive} onFailure={signIn.setFailure} />
      </form>
    </AuthCard>
  );
}
