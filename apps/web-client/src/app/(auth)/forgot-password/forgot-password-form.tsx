'use client';

/**
 * Starting a password reset.
 *
 * The confirmation is identical whether or not the address is on an account, because anything else
 * turns this box into a way of asking "does this person bank here". The API acknowledges every
 * request for the same reason; the screen simply does not undo that.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { emailSchema } from '@reliance/contracts';
import { Alert, Button, FormField, Input } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { browserApi } from '@/lib/api';
import { authRoutes } from '@/lib/routes';

import { AuthCard } from '../_components/auth-card';

const formSchema = z.object({ email: emailSchema });
type FormValues = z.infer<typeof formSchema>;

function Sent({ email }: { readonly email: string }) {
  return (
    <AuthCard
      title="Check your inbox"
      description="If there is an account for that address, a reset link is on its way."
      footer={
        <Link href={authRoutes.signIn} className="text-accent font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div role="status" className="flex flex-col gap-4">
        <Alert tone="info" title={`Sent to ${email}`}>
          The link works once and expires after an hour. If it does not arrive in a few minutes,
          check your spam folder.
        </Alert>
        <p className="text-fg-muted text-sm">
          We will never ask you for your password, a card PIN or a one-time code — not by email, not
          by text, and not on the phone.
        </p>
      </div>
    </AuthCard>
  );
}

/**
 * Asks for a reset link.
 *
 * The confirmation is shown for whatever address was typed, whether or not an account
 * exists behind it. Saying "no such account" would turn this form into an oracle for which
 * addresses are registered, and the platform answers both cases identically.
 */
function useForgotPassword() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  async function submit(values: FormValues): Promise<void> {
    setFailure(null);
    try {
      await browserApi().auth.forgotPassword(values);
      setSentTo(values.email);
    } catch (error) {
      setFailure(error);
    }
  }

  return { form, submit, sentTo, failure };
}

/** Collects the email address a reset link should be sent to. */
export function ForgotPasswordForm() {
  const { form, submit, sentTo, failure } = useForgotPassword();

  if (sentTo) return <Sent email={sentTo} />;

  return (
    <AuthCard
      title="Reset your password"
      description="Tell us the email address on your account and we will send you a link."
      footer={
        <Link href={authRoutes.signIn} className="text-accent font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
        <FormAlert error={failure} />
        <FormField label="Email address" error={form.formState.errors.email?.message} required>
          <Input
            type="email"
            inputMode="email"
            autoComplete="username"
            {...form.register('email')}
          />
        </FormField>
        <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
          Send me a reset link
        </Button>
      </form>
    </AuthCard>
  );
}
