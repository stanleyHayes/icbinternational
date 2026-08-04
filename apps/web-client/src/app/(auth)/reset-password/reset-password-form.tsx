'use client';

/**
 * Choosing a new password.
 *
 * The confirmation field is checked in the browser, because comparing two strings is not something
 * to spend a round trip on and getting it wrong is the most common mistake on this screen. The
 * password itself is judged by the shared contract schema, so the browser and the API agree on
 * what is acceptable.
 *
 * Succeeding here revokes every other session, and the screen says so before it happens — a
 * customer signed out of their phone with no explanation assumes the worst.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { passwordSchema } from '@reliance/contracts';
import { Alert, Button } from '@reliance/ui';

import { FormAlert, LinkButton } from '@/components/shell';
import { browserApi } from '@/lib/api';
import { authRoutes, SignInReason, signInWithReturn } from '@/lib/routes';

import { AuthCard } from '../_components/auth-card';
import { PasswordField } from '../_components/password-field';

const PASSWORD_HINT =
  'At least 12 characters, with an uppercase letter, a lowercase letter and a number.';

const formSchema = z
  .object({ password: passwordSchema, confirmation: z.string() })
  .refine((values) => values.password === values.confirmation, {
    message: 'Both passwords need to be the same.',
    path: ['confirmation'],
  });

type FormValues = z.infer<typeof formSchema>;

function MissingToken() {
  return (
    <AuthCard
      title="This link is not complete"
      description="Reset links expire after an hour and can only be used once. Ask for a new one and it will work."
    >
      <LinkButton href={authRoutes.forgotPassword} fullWidth>
        Send me a new link
      </LinkButton>
    </AuthCard>
  );
}

function Fields({ form }: { readonly form: UseFormReturn<FormValues> }) {
  return (
    <>
      <PasswordField
        label="New password"
        hint={PASSWORD_HINT}
        autoComplete="new-password"
        error={form.formState.errors.password?.message}
        registration={form.register('password')}
      />

      <PasswordField
        label="New password again"
        autoComplete="new-password"
        error={form.formState.errors.confirmation?.message}
        registration={form.register('confirmation')}
      />

      <Alert tone="info" title="You will be signed out everywhere else">
        Changing your password ends every other session, on every device. You will need to sign in
        again on each of them.
      </Alert>
    </>
  );
}

/** Props for {@link ResetPasswordForm}. */
export interface ResetPasswordFormProps {
  /** The token from the emailed link. */
  readonly token: string | null;
}

/** Sets a new password from a reset token. */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [failure, setFailure] = useState<unknown>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  async function submit(values: FormValues): Promise<void> {
    if (!token) return;
    setFailure(null);
    try {
      await browserApi().auth.resetPassword({ token, password: values.password });
      router.replace(signInWithReturn(null, SignInReason.CREDENTIALS_UPDATED));
    } catch (error) {
      setFailure(error);
    }
  }

  if (!token) return <MissingToken />;

  return (
    <AuthCard
      title="Choose a new password"
      description="Pick something you have not used here before."
    >
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
        <FormAlert error={failure} />
        <Fields form={form} />
        <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
          Save my new password
        </Button>
      </form>
    </AuthCard>
  );
}
