'use client';

/**
 * Getting your data out, and closing the relationship.
 *
 * Both are rights rather than favours, so neither is buried or made deliberately awkward. Closing
 * an account is nevertheless the most destructive thing in the application, so it is
 * confirm-and-step-up gated and states plainly what has to be true first: every balance swept, and
 * nothing still to settle.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert, Button, Textarea } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { ConfirmAction, Section, stepUpOptions } from '@/components/transfers';
import { browserApi } from '@/lib/api';

const REASON_MAX = 500;

const CLOSE_CONSEQUENCE =
  'We close every account you hold with us and end your access. Any money left is sent to the account you nominate first, and we keep your records for as long as the law requires. This cannot be undone.';

/** Requests a copy of everything the bank holds. */
function ExportPanel() {
  const request = useMutation({
    mutationFn: async () =>
      (await browserApi().profile.requestDataExport({ includes: [], format: 'ZIP' })).data,
  });

  return (
    <Section
      title="Get a copy of your data"
      description="Everything we hold about you, in a file you can keep or take elsewhere."
    >
      <div className="flex flex-col gap-4">
        <FormAlert error={request.error} />

        {request.isSuccess ? (
          <div role="status" aria-live="polite">
            <Alert tone="success" title="We are putting it together">
              Large exports take a few minutes. We will email you a secure link when it is ready.
            </Alert>
          </div>
        ) : null}

        <div>
          <Button loading={request.isPending} onClick={() => request.mutate()}>
            Request my data
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Closing the whole relationship. */
function ClosePanel() {
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  const close = useMutation({
    mutationFn: async ({ stepUpToken }: { readonly stepUpToken?: string }) => {
      await browserApi().profile.closeAccount(
        { reason: reason.trim(), confirm: true },
        stepUpOptions(stepUpToken),
      );
    },
  });

  return (
    <Section
      title="Close your account"
      description="We are sorry to see you go. Tell us why if you would like to — it genuinely helps."
    >
      <div className="flex flex-col gap-4">
        <FormAlert error={close.error} />

        <ClosingConditions />

        <ReasonField value={reason} onChange={setReason} />

        <div>
          <Button variant="danger" disabled={!reason.trim()} onClick={() => setConfirming(true)}>
            Close my account
          </Button>
        </div>

        <ConfirmAction
          open={confirming}
          onClose={() => setConfirming(false)}
          title="Close your Reliance Bank account"
          consequence={CLOSE_CONSEQUENCE}
          confirmLabel="Close my account"
          destructive
          stepUpReason="close your account"
          onConfirm={(options) => close.mutateAsync(options)}
        />
      </div>
    </Section>
  );
}

/**
 * @example <PrivacyPanel />
 */
export function PrivacyPanel() {
  return (
    <div className="flex flex-col gap-6">
      <ExportPanel />
      <ClosePanel />
    </div>
  );
}

/** What has to be true before an account can be closed. */
function ClosingConditions() {
  return (
    <Alert tone="warning" title="Before you can close">
      Every account has to be empty and nothing can still be settling — no pending payments, no open
      disputes, no loan outstanding. If anything is left we will tell you what.
    </Alert>
  );
}

/** Why the customer is leaving. Optional to them, and genuinely read by us. */
function ReasonField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Textarea
      value={value}
      maxLength={REASON_MAX}
      showCount
      aria-label="Why you are closing your account"
      placeholder="Why are you leaving? Optional, and we read every one."
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
