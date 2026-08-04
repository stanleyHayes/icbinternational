/**
 * The refusals that end an attempt.
 *
 * Each one says what happened, why, and exactly who resolves it. "Contact your
 * administrator" is not that: an operator locked out at 07:40 with a queue filling up
 * needs to know it is the security desk, and that reopening the form will not help.
 *
 * The network refusal deliberately does not print the address it saw. It is the one piece
 * of information that helps somebody probing the allowlist and does nothing for the
 * operator, whose desk address they cannot change anyway.
 */

'use client';

import { Building2, Lock, ShieldOff, SmartphoneNfc } from 'lucide-react';
import type { ComponentType } from 'react';

import { type ApiClientError } from '@reliance/api-client';
import { ErrorCode } from '@reliance/contracts';
import { Alert, Button } from '@reliance/ui';

import { traceIdFor } from '@/lib/errors';

interface Refusal {
  readonly heading: string;
  readonly body: string;
  readonly Icon: ComponentType<{ readonly className?: string }>;
}

const DEFAULT_REFUSAL: Refusal = {
  heading: 'We cannot sign you in',
  body: 'Your staff account could not be used from here. Contact the security desk to have it checked.',
  Icon: ShieldOff,
};

const REFUSALS: Partial<Record<ErrorCode, Refusal>> = {
  [ErrorCode.IP_NOT_ALLOWED]: {
    heading: 'This network is not approved for your account',
    body: 'Staff sign-in is restricted to the bank’s own networks and managed devices. Connect from an office network or the corporate VPN, or ask the security desk to review the allowlist for your account.',
    Icon: Building2,
  },
  [ErrorCode.ACCOUNT_LOCKED]: {
    heading: 'Your staff account is locked',
    body: 'Too many failed attempts, or a lock applied by the security desk. Only the security desk can release it — no amount of waiting will.',
    Icon: Lock,
  },
  [ErrorCode.ACCOUNT_SUSPENDED]: {
    heading: 'Your staff account is suspended',
    body: 'Access has been withdrawn pending a review. Speak to your team lead; the security desk cannot restore it on your request alone.',
    Icon: Lock,
  },
  [ErrorCode.MFA_NOT_ENROLLED]: {
    heading: 'No authenticator is enrolled',
    body: 'This console cannot be used without a second factor. The security desk will enrol your authenticator in person and issue a one-time enrolment code.',
    Icon: SmartphoneNfc,
  },
  [ErrorCode.PERMISSION_DENIED]: {
    heading: 'Your account has no console access',
    body: 'The credentials are valid but the account holds no operations role. Your team lead can raise an access request.',
    Icon: ShieldOff,
  },
};

export interface SignInRefusalProps {
  readonly error: ApiClientError;
  /** Returns the operator to the form, for the cases where that is worth offering. */
  readonly onStartAgain: () => void;
}

/** A terminal sign-in refusal, explained. */
export function SignInRefusal({ error, onStartAgain }: SignInRefusalProps) {
  const refusal = REFUSALS[error.code] ?? DEFAULT_REFUSAL;
  const traceId = traceIdFor(error);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <refusal.Icon className="text-danger mt-0.5 size-5 shrink-0" />
        <h1 className="font-display text-lg font-semibold">{refusal.heading}</h1>
      </div>

      <p className="font-body text-fg-muted text-sm">{refusal.body}</p>

      {traceId && (
        <Alert tone="neutral">
          Quote this reference when you contact the security desk:{' '}
          <span className="font-mono text-xs">{traceId}</span>
        </Alert>
      )}

      <Button variant="secondary" fullWidth onClick={onStartAgain}>
        Back to sign in
      </Button>
    </div>
  );
}
