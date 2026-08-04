'use client';

/**
 * Confirming a mobile number.
 *
 * Two steps in one screen: the number, then the code. Keeping them together means a mistyped
 * number is corrected in place rather than by going back, which is where people give up.
 *
 * The number is never treated as confirmed on the strength of a code the browser checked. The bank
 * decides; this screen only relays.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { Button, FormField, Input, OTP_LENGTH, OTPInput } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { maskPhone } from '@/lib/format';
import { confirmPhone, requestPhoneCodeSchema, sendPhoneCode } from '@/lib/phone-verification';
import { onboardingRoutes } from '@/lib/routes';

import { AuthCard } from '../_components/auth-card';

type NumberValues = z.infer<typeof requestPhoneCodeSchema>;

function NumberStep({ onSent }: { readonly onSent: (phone: string) => void }) {
  const [failure, setFailure] = useState<unknown>(null);
  const form = useForm<NumberValues>({
    resolver: zodResolver(requestPhoneCodeSchema),
    defaultValues: { phone: '' },
  });

  async function submit(values: NumberValues): Promise<void> {
    setFailure(null);
    try {
      await sendPhoneCode(values);
      onSent(values.phone);
    } catch (error) {
      setFailure(error);
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
      <FormAlert error={failure} title="We could not send a code" />
      <FormField
        label="Mobile number"
        hint="Include the country code, for example +44 7700 900123."
        error={form.formState.errors.phone?.message}
        required
      >
        <Input type="tel" inputMode="tel" autoComplete="tel" {...form.register('phone')} />
      </FormField>
      <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
        Send me a code
      </Button>
    </form>
  );
}

/**
 * Confirming the code.
 *
 * A rejected code clears the field. Leaving the wrong digits in place invites the customer
 * to press confirm again on the same value, and the six boxes give no clue which one was
 * mistyped.
 */
function useConfirmPhone(phone: string) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string): Promise<void> {
    setBusy(true);
    setFailure(null);
    try {
      await confirmPhone({ phone, code: value });
      router.push(onboardingRoutes.start);
    } catch (error) {
      setFailure(error);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return { code, setCode, failure, busy, submit };
}

function CodeStep({
  phone,
  onChangeNumber,
}: {
  readonly phone: string;
  readonly onChangeNumber: () => void;
}) {
  const { code, setCode, failure, busy, submit } = useConfirmPhone(phone);

  return (
    <div className="flex flex-col gap-5">
      <FormAlert error={failure} title="That code did not work" />
      <OTPInput
        label={`Code sent to ${maskPhone(phone)}`}
        value={code}
        onValueChange={setCode}
        onComplete={(value) => void submit(value)}
        disabled={busy}
      />
      <Button
        fullWidth
        loading={busy}
        disabled={code.length < OTP_LENGTH}
        onClick={() => void submit(code)}
      >
        Confirm my number
      </Button>
      <Button variant="ghost" fullWidth onClick={onChangeNumber}>
        Use a different number
      </Button>
    </div>
  );
}

/** Collects a mobile number and the code sent to it. */
export function VerifyPhoneForm() {
  const [phone, setPhone] = useState<string | null>(null);

  return (
    <AuthCard
      title="Confirm your mobile number"
      description="We use it to alert you about payments and to reach you if something looks wrong."
      footer={
        <a href={onboardingRoutes.start} className="text-accent font-medium hover:underline">
          I will do this later
        </a>
      }
    >
      {phone === null ? (
        <NumberStep onSent={setPhone} />
      ) : (
        <CodeStep phone={phone} onChangeNumber={() => setPhone(null)} />
      )}
    </AuthCard>
  );
}
