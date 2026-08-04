'use client';

/**
 * Opening an account.
 *
 * The contract's own `registerRequestSchema` validates the form, so the browser and the API agree
 * on what is acceptable and the customer is never refused for a rule the screen did not state.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { CustomerSegment, registerRequestSchema } from '@reliance/contracts';
import { Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { browserApi } from '@/lib/api';
import { authRoutes } from '@/lib/routes';

import { AuthCard } from '../_components/auth-card';

import { RegisterConsent } from './register-consent';
import { RegisterFields } from './register-fields';

type FormValues = z.input<typeof registerRequestSchema>;

const EMPTY_FORM: Partial<FormValues> = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  segment: CustomerSegment.PERSONAL,
  locale: 'en-GB',
  marketingOptIn: false,
};

function Footer() {
  return (
    <>
      Already bank with us?{' '}
      <Link href={authRoutes.signIn} className="text-accent font-medium hover:underline">
        Sign in
      </Link>
    </>
  );
}

/** Name, email, password and the two consents. */
export function RegisterForm() {
  const router = useRouter();
  const [failure, setFailure] = useState<unknown>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: EMPTY_FORM,
  });

  async function submit(values: FormValues): Promise<void> {
    setFailure(null);
    try {
      await browserApi().auth.register(registerRequestSchema.parse(values));
      router.push(authRoutes.verifyEmail);
    } catch (error) {
      setFailure(error);
    }
  }

  return (
    <AuthCard
      title="Open an account"
      description="Two minutes to create your login. We will verify your identity afterwards."
      footer={<Footer />}
    >
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
        <FormAlert error={failure} />
        <RegisterFields register={form.register} errors={form.formState.errors} />
        <RegisterConsent
          termsError={form.formState.errors.acceptedTerms?.message}
          termsRegistration={form.register('acceptedTerms')}
          marketingRegistration={form.register('marketingOptIn')}
        />
        <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
          Create my account
        </Button>
      </form>
    </AuthCard>
  );
}
