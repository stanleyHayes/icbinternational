'use client';

/**
 * What is happening to a submitted application.
 *
 * Every status gets a sentence about *time* as well as state, because "under review" without "most
 * are done within an hour" is the thing that generates the phone call. Where the bank has asked
 * for something, the reviewer's own words are shown — a customer told "more information required"
 * with no clue which information will send the same document again.
 */

import { KycStatus, type KycCase } from '@reliance/contracts';
import { Alert, SkeletonText, StatusPill, type Tone } from '@reliance/ui';

import { FormAlert, LinkButton } from '@/components/shell';
import { formatDateTime } from '@/lib/format';
import { appRoutes, onboardingRoutes } from '@/lib/routes';

import { useKycCase } from './use-kyc-case';

interface Presentation {
  readonly tone: Tone;
  readonly pill: string;
  readonly heading: string;
  readonly body: string;
}

const PRESENTATION: Readonly<Record<KycStatus, Presentation>> = {
  NOT_STARTED: {
    tone: 'neutral',
    pill: 'Not started',
    heading: 'Let’s open your account',
    body: 'It takes about five minutes and you can stop and come back at any point.',
  },
  IN_PROGRESS: {
    tone: 'info',
    pill: 'In progress',
    heading: 'You are part of the way through',
    body: 'Everything you have entered is saved. Carry on where you left off.',
  },
  SUBMITTED: {
    tone: 'info',
    pill: 'Received',
    heading: 'We have your application',
    body: 'Our team picks it up next. Most applications are decided within an hour during the working day.',
  },
  UNDER_REVIEW: {
    tone: 'pending',
    pill: 'Being reviewed',
    heading: 'Someone is looking at it now',
    body: 'We are checking your documents against your details. We will email you as soon as there is a decision.',
  },
  MORE_INFO_REQUIRED: {
    tone: 'warning',
    pill: 'Needs something',
    heading: 'We need one more thing',
    body: 'Send us what is described below and your application goes straight back into the queue.',
  },
  APPROVED: {
    tone: 'credit',
    pill: 'Approved',
    heading: 'Your account is open',
    body: 'Everything is ready. Your account number and sort code are waiting for you.',
  },
  REJECTED: {
    tone: 'danger',
    pill: 'Not approved',
    heading: 'We could not open an account this time',
    body: 'We are not able to explain the reasons in detail. If your circumstances change, you are welcome to apply again.',
  },
  EXPIRED: {
    tone: 'neutral',
    pill: 'Expired',
    heading: 'This application has expired',
    body: 'Applications are held for 30 days. Starting again takes a few minutes, and we keep nothing from the old one.',
  },
};

function Actions({ kycCase }: { readonly kycCase: KycCase }) {
  if (kycCase.status === KycStatus.APPROVED) {
    return <LinkButton href={appRoutes.dashboard}>Go to your account</LinkButton>;
  }
  if (kycCase.status === KycStatus.REJECTED) return null;
  if (kycCase.nextStep) {
    return <LinkButton href={onboardingRoutes.start}>Carry on</LinkButton>;
  }
  return null;
}

/** The application's current state, with what happens next. */
export function StatusTracker() {
  const { data: kycCase, isPending, error } = useKycCase();

  if (error) return <FormAlert error={error} title="We could not load your application" />;
  if (isPending || !kycCase) return <SkeletonText lines={5} />;

  const view = PRESENTATION[kycCase.status];

  return (
    <div className="flex flex-col gap-6">
      <StatusPill tone={view.tone} label={view.pill} />

      <div>
        <h1 className="font-display text-fg text-3xl font-semibold tracking-tight text-balance">
          {view.heading}
        </h1>
        <p className="text-fg-muted mt-2 max-w-prose text-base text-pretty">{view.body}</p>
      </div>

      {kycCase.reviewerMessage ? (
        <Alert tone="warning" title="What we need from you">
          {kycCase.reviewerMessage}
        </Alert>
      ) : null}

      <dl className="border-border bg-surface grid gap-4 rounded-lg border p-5 sm:grid-cols-2">
        <div>
          <dt className="text-fg-muted text-sm">Submitted</dt>
          <dd className="text-fg text-base">
            {kycCase.submittedAt ? formatDateTime(kycCase.submittedAt) : 'Not yet'}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted text-sm">Last updated</dt>
          <dd className="text-fg text-base">{formatDateTime(kycCase.updatedAt)}</dd>
        </div>
      </dl>

      <Actions kycCase={kycCase} />
    </div>
  );
}
