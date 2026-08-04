/**
 * Looking at the bank through a customer's eyes.
 *
 * Impersonation exists because a support agent cannot fix what they cannot see, and
 * describing a screen down the telephone fails. It is also the single most invasive thing
 * this console can do, so three things are true of it here and are said out loud: it is
 * read-only, it expires, and the justification typed into this box is stored word for
 * word in the audit chain and shown in a banner across the top of every screen for as
 * long as the grant lasts.
 *
 * The read-only switch is offered rather than assumed, because a grant that silently
 * permitted writes would be indistinguishable to the operator from one that did not.
 */

'use client';

import { useState } from 'react';

import type { User } from '@reliance/contracts';
import { Alert, Button, Dialog, FormField, Switch, Textarea } from '@reliance/ui';

import { failureMessage } from '@/components/compliance/kit';
import type { ImpersonationGrantSummary } from '@/lib/customer-context';

import { useImpersonateCustomer } from '../data/use-customers';

/** A justification has to be a sentence somebody could defend in a review. */
const MIN_JUSTIFICATION_LENGTH = 20;

const TOO_SHORT = `Write at least ${MIN_JUSTIFICATION_LENGTH} characters saying why you need to see this.`;

const CONSEQUENCES =
  'Your name, the reason you give and the exact time are written to the audit chain, and a ' +
  'banner naming this customer stays across the top of the console until the grant expires.';

const JUSTIFICATION_HINT =
  'Name the ticket or the case. “Investigating” on its own is not a reason.';

interface GrantFormProps {
  readonly justification: string;
  readonly readOnly: boolean;
  readonly error: string | null;
  readonly fieldError: string | null;
  readonly disabled: boolean;
  readonly onJustificationChange: (justification: string) => void;
  readonly onReadOnlyChange: (readOnly: boolean) => void;
}

function GrantForm(props: GrantFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning" title="This is recorded">
        {CONSEQUENCES}
      </Alert>

      {props.error && <Alert tone="danger">{props.error}</Alert>}

      <FormField
        label="Why do you need to see this?"
        required
        hint={JUSTIFICATION_HINT}
        error={props.fieldError}
      >
        <Textarea
          rows={3}
          value={props.justification}
          disabled={props.disabled}
          onChange={(event) => props.onJustificationChange(event.target.value)}
        />
      </FormField>

      <Switch
        checked={props.readOnly}
        disabled={props.disabled}
        onChange={(event) => props.onReadOnlyChange(event.target.checked)}
      >
        Read-only — you can see the customer&rsquo;s screens but cannot act on their behalf
      </Switch>
    </div>
  );
}

interface FooterProps {
  readonly isPending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

function Footer({ isPending, onCancel, onConfirm }: FooterProps) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel} disabled={isPending}>
        Cancel
      </Button>
      <Button loading={isPending} onClick={onConfirm}>
        Start the session
      </Button>
    </>
  );
}

export interface ImpersonationDialogProps {
  readonly customer: User;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Hands the granted session to the record so the banner can declare it. */
  readonly onGranted: (grant: ImpersonationGrantSummary) => void;
}

/** The justification box and the grant request behind the confirm button. */
function useGrantForm(props: ImpersonationDialogProps) {
  const [justification, setJustification] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const impersonate = useImpersonateCustomer(props.customer.id);

  const tooShort = justification.trim().length < MIN_JUSTIFICATION_LENGTH;

  return {
    justification,
    setJustification,
    readOnly,
    setReadOnly,
    attempted,
    impersonate,
    tooShort,
    submit: () => {
      setAttempted(true);
      if (tooShort) return;
      impersonate.mutate(
        { justification: justification.trim(), readOnly },
        {
          onSuccess: (grant) => {
            props.onGranted({ expiresAt: grant.expiresAt, readOnly: grant.readOnly });
            setJustification('');
            setAttempted(false);
            props.onClose();
          },
        },
      );
    },
  };
}

/** Confirms an impersonation grant and records why it was needed. */
export function ImpersonationDialog(props: ImpersonationDialogProps) {
  const { customer, open, onClose } = props;
  const {
    attempted,
    impersonate,
    justification,
    readOnly,
    setJustification,
    setReadOnly,
    submit,
    tooShort,
  } = useGrantForm(props);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="View the bank as this customer"
      description={`${customer.firstName} ${customer.lastName} · ${customer.email}`}
      footer={<Footer isPending={impersonate.isPending} onCancel={onClose} onConfirm={submit} />}
    >
      <GrantForm
        justification={justification}
        readOnly={readOnly}
        error={impersonate.isError ? failureMessage(impersonate.error) : null}
        fieldError={attempted && tooShort ? TOO_SHORT : null}
        disabled={impersonate.isPending}
        onJustificationChange={setJustification}
        onReadOnlyChange={setReadOnly}
      />
    </Dialog>
  );
}
