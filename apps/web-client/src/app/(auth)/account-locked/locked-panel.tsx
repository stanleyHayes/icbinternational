'use client';

/**
 * Lockout messaging.
 *
 * Three things a locked-out customer needs, in this order: that their money is safe, what unlocks
 * the account, and a phone number. Anything else on this screen is in the way.
 *
 * It deliberately does not say how many attempts were made or how long the lock lasts. Both are
 * useful to somebody working through a password list and to nobody else.
 */

import Link from 'next/link';

import { Alert } from '@reliance/ui';

import { LinkButton } from '@/components/shell';
import { authRoutes } from '@/lib/routes';

import { AuthCard } from '../_components/auth-card';

const SUPPORT_NUMBER = '0800 460 0460';

/** What to do about a locked account. */
/** The one route back in. */
function UnlockInstructions() {
  return (
    <div>
      <h2 className="text-fg text-base font-medium">How to unlock it</h2>
      <p className="text-fg-muted mt-1 text-sm">
        Resetting your password unlocks the account at the same time. You will need access to the
        email address you registered with.
      </p>
    </div>
  );
}

/**
 * What to do if the customer was not the one signing in.
 *
 * Given its own box because a lock the customer did not cause is the one case on this page
 * that is urgent, and the number has to be findable without reading the rest.
 */
function FraudNotice() {
  return (
    <div className="border-border bg-canvas rounded-lg border p-4">
      <h2 className="text-fg text-base font-medium">If that is not you</h2>
      <p className="text-fg-muted mt-1 text-sm">
        If you have not been trying to sign in, somebody else has. Call us on{' '}
        <a
          href={`tel:${SUPPORT_NUMBER.replaceAll(' ', '')}`}
          className="text-accent font-medium hover:underline"
        >
          {SUPPORT_NUMBER}
        </a>{' '}
        — we answer 24 hours a day for anything that looks like fraud.
      </p>
    </div>
  );
}

export function LockedPanel() {
  return (
    <AuthCard
      title="This account is locked"
      description="We locked it after several unsuccessful sign-in attempts. This is automatic, and it is there to stop somebody else getting in."
      footer={
        <Link href={authRoutes.signIn} className="text-accent font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        <Alert tone="success" title="Your money is untouched">
          Nothing has left your accounts, and no payment has been made. A lock only blocks signing
          in.
        </Alert>

        <UnlockInstructions />

        <LinkButton href={authRoutes.forgotPassword} fullWidth>
          Reset my password
        </LinkButton>

        <FraudNotice />
      </div>
    </AuthCard>
  );
}
