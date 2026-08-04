'use client';

/**
 * The step-up prompt.
 *
 * Says what it is confirming before it asks for anything. "Enter your code" with no context is
 * indistinguishable from a phishing overlay, and teaching customers to type authenticator codes
 * into unexplained boxes is a habit a bank has no business creating.
 *
 * A customer with no second factor enrolled is told so and sent to set one up, rather than being
 * shown a field that cannot succeed.
 *
 * The confirm button lives in the dialog's footer, outside the form element, so it is associated
 * by `form=` rather than by nesting. That keeps Enter-to-submit working from the code field, which
 * is how most people will actually complete this.
 */

import { useState } from 'react';

import { MfaMethod } from '@reliance/contracts';
import { Alert, Button, Dialog, OTP_LENGTH, OTPInput } from '@reliance/ui';

import { browserApi } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { appRoutes } from '@/lib/routes';
import { useSessionUser } from '@/lib/use-session-user';

import { LinkButton } from './link-button';

const FORM_ID = 'step-up-form';

/** The codes we can ask a customer to type. A passkey ceremony is not one of them. */
const TYPEABLE: ReadonlySet<MfaMethod> = new Set([
  MfaMethod.TOTP,
  MfaMethod.SMS,
  MfaMethod.RECOVERY_CODE,
]);

/** Props for {@link StepUpDialog}. */
export interface StepUpDialogProps {
  /** What is being confirmed, phrased for the customer. `null` closes the dialog. */
  readonly reason: string | null;
  readonly onCancel: () => void;
  readonly onGranted: (token: string) => void;
}

function NoFactorEnrolled() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-fg-muted text-sm">
        To confirm sensitive changes we need a second step on your account — an authenticator app, a
        code by text, or a passkey. Setting one up takes about a minute.
      </p>
      <LinkButton href={appRoutes.settingsSecurity}>Set up a second step</LinkButton>
    </div>
  );
}

function Footer({
  busy,
  ready,
  onCancel,
}: {
  readonly busy: boolean;
  readonly ready: boolean;
  readonly onCancel: () => void;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" form={FORM_ID} loading={busy} disabled={!ready}>
        Confirm
      </Button>
    </>
  );
}

interface CodeFormProps {
  readonly code: string;
  readonly failure: string | null;
  readonly busy: boolean;
  readonly onCodeChange: (code: string) => void;
  readonly onSubmit: () => void;
}

function CodeForm({ code, failure, busy, onCodeChange, onSubmit }: CodeFormProps) {
  return (
    <form
      id={FORM_ID}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      {failure ? (
        <Alert tone="danger" title="That did not work">
          {failure}
        </Alert>
      ) : null}
      <OTPInput
        label="Confirmation code"
        value={code}
        onValueChange={onCodeChange}
        onComplete={onSubmit}
        disabled={busy}
      />
    </form>
  );
}

interface Exchange {
  readonly code: string;
  readonly setCode: (code: string) => void;
  readonly failure: string | null;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly confirm: () => void;
}

/** Holds the typed code and swaps it for a grant. */
function useStepUpExchange(
  method: MfaMethod | undefined,
  onGranted: (token: string) => void,
): Exchange {
  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = code.length >= OTP_LENGTH;

  const confirm = (): void => {
    if (!method || !ready) return;
    setBusy(true);
    setFailure(null);
    void browserApi()
      .auth.stepUp({ method, credential: code })
      .then(({ data }) => {
        setCode('');
        onGranted(data.token);
      })
      .catch((error: unknown) => {
        setFailure(describeError(error).message);
        setCode('');
      })
      .finally(() => setBusy(false));
  };

  return { code, setCode, failure, busy, ready, confirm };
}

/** Asks for a one-time code and exchanges it for a short-lived grant. */
export function StepUpDialog({ reason, onCancel, onGranted }: StepUpDialogProps) {
  const { data: user } = useSessionUser();
  const method = user?.mfaMethods.find((candidate) => TYPEABLE.has(candidate));
  const { code, setCode, failure, busy, ready, confirm } = useStepUpExchange(method, onGranted);

  return (
    <Dialog
      open={reason !== null}
      onClose={onCancel}
      title="Confirm it's you"
      description={
        reason ? `Before we ${reason}, enter the code from your authenticator.` : undefined
      }
      size="sm"
      footer={method ? <Footer busy={busy} ready={ready} onCancel={onCancel} /> : null}
    >
      {method ? (
        <CodeForm
          code={code}
          failure={failure}
          busy={busy}
          onCodeChange={setCode}
          onSubmit={confirm}
        />
      ) : (
        <NoFactorEnrolled />
      )}
    </Dialog>
  );
}
