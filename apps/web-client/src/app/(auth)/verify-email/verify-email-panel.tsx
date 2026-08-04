'use client';

/**
 * Confirming an email address.
 *
 * One screen, three states, because they are three stages of the same task and splitting them
 * across routes would strand anyone who follows the link twice. With a token in the URL it
 * verifies; without one it explains where to look; on success it hands over to onboarding.
 *
 * Resending is rate-limited server-side, and the button says so after the first press rather than
 * silently doing nothing on the fourth.
 */

import { MailCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, Button } from '@reliance/ui';

import { FormAlert, LinkButton } from '@/components/shell';
import { browserApi } from '@/lib/api';
import { onboardingRoutes } from '@/lib/routes';

import { AuthCard } from '../_components/auth-card';

type Phase = 'checking' | 'confirmed' | 'awaiting' | 'failed';

function useVerification(token: string | null): { phase: Phase; failure: unknown } {
  const [phase, setPhase] = useState<Phase>(token ? 'checking' : 'awaiting');
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    void browserApi()
      .auth.verifyEmail({ token })
      .then(() => live && setPhase('confirmed'))
      .catch((error: unknown) => {
        if (!live) return;
        setFailure(error);
        setPhase('failed');
      });
    return () => {
      live = false;
    };
  }, [token]);

  return { phase, failure };
}

function ResendButton() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resend(): Promise<void> {
    setBusy(true);
    try {
      await browserApi().auth.resendVerification();
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" fullWidth loading={busy} onClick={() => void resend()}>
        Send the link again
      </Button>
      <p aria-live="polite" className="text-fg-muted text-sm">
        {sent ? 'Sent. It can take a minute or two to arrive.' : ''}
      </p>
    </div>
  );
}

/** Props for {@link VerifyEmailPanel}. */
export interface VerifyEmailPanelProps {
  /** The token from the emailed link, when the customer arrived through one. */
  readonly token: string | null;
}

function Confirmed() {
  return (
    <AuthCard
      title="Email confirmed"
      description="That is your address verified. Next, we need to check who you are — it takes about five minutes."
    >
      <div className="flex flex-col gap-4">
        <Alert
          tone="success"
          title="You are all set to continue"
          icon={<MailCheck aria-hidden="true" className="size-5" />}
        >
          We will ask for your date of birth, your address and a photo of your ID.
        </Alert>
        <LinkButton href={onboardingRoutes.start} fullWidth>
          Continue
        </LinkButton>
      </div>
    </AuthCard>
  );
}

function Checking() {
  return (
    <AuthCard title="Confirming your email" description="One moment.">
      <p role="status" aria-live="polite" className="text-fg-muted text-sm">
        Checking the link you followed.
      </p>
    </AuthCard>
  );
}

/** Verifies a token, or explains that one is on its way. */
export function VerifyEmailPanel({ token }: VerifyEmailPanelProps) {
  const { phase, failure } = useVerification(token);

  if (phase === 'confirmed') return <Confirmed />;
  if (phase === 'checking') return <Checking />;

  return (
    <AuthCard
      title={phase === 'failed' ? 'That link did not work' : 'Check your inbox'}
      description={
        phase === 'failed'
          ? 'Verification links expire after 24 hours, and each one can only be used once.'
          : 'We have sent you a link to confirm your email address. Open it on any device to carry on.'
      }
    >
      <div className="flex flex-col gap-5">
        <FormAlert error={failure} title="We could not confirm that link" />
        <ResendButton />
        <p className="text-fg-muted text-sm">
          Not in your inbox? Check the spam folder, and make sure you typed your address correctly
          when you registered.
        </p>
      </div>
    </AuthCard>
  );
}
