/**
 * Freezing, and saying so plainly.
 *
 * A freeze is described here in full — sessions ended, sign-in refused, outgoing payments
 * stopped, incoming payments still credited — because operators routinely believe it does
 * less than it does, apply it as a precaution, and leave somebody unable to pay their rent
 * over a weekend. Naming every consequence in the dialog is the cheapest control there is.
 *
 * The reason is mandatory and goes into the audit chain verbatim. It is also the sentence
 * the next person to open this record will read when they decide whether to lift it.
 */

'use client';

import { useState } from 'react';

import { UserStatus, type User } from '@reliance/contracts';
import { Alert, Button, Dialog, FormField, Textarea } from '@reliance/ui';

import { failureMessage } from '@/components/compliance/kit';

import { useFreezeCustomer } from '../data/use-customers';

/** A reason short enough to be meaningless is worse than none: it looks like diligence. */
const MIN_REASON_LENGTH = 12;

const TOO_SHORT = `Give at least ${MIN_REASON_LENGTH} characters. This is the record of why.`;

const FREEZE_EFFECTS = [
  'Every active session ends immediately and the customer cannot sign in again.',
  'Outgoing payments, transfers and card authorisations are refused.',
  'Money paid in is still credited, so nothing is lost while the freeze is on.',
  'The customer sees a message asking them to contact us. They are not told why.',
];

const RELEASE_EFFECTS = [
  'The customer can sign in again and their payments resume.',
  'Any hold placed separately by compliance or by a court order stays in force.',
];

const REASON_HINT = 'Recorded against your staff account and shown to whoever reviews this next.';

interface FooterProps {
  readonly freezing: boolean;
  readonly isPending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

function Footer({ freezing, isPending, onCancel, onConfirm }: FooterProps) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel} disabled={isPending}>
        Cancel
      </Button>
      <Button variant={freezing ? 'danger' : 'primary'} loading={isPending} onClick={onConfirm}>
        {freezing ? 'Freeze the account' : 'Lift the freeze'}
      </Button>
    </>
  );
}

export interface FreezeDialogProps {
  readonly customer: User;
  readonly open: boolean;
  readonly onClose: () => void;
}

function Effects({ freezing }: Readonly<{ freezing: boolean }>) {
  return (
    <ul className="font-body text-fg-muted flex list-disc flex-col gap-1 pl-5 text-sm">
      {(freezing ? FREEZE_EFFECTS : RELEASE_EFFECTS).map((effect) => (
        <li key={effect}>{effect}</li>
      ))}
    </ul>
  );
}

/** The reason box and the mutation behind the confirm button. */
function useFreezeForm(customer: User, onDone: () => void) {
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const freeze = useFreezeCustomer(customer.id);

  const freezing = customer.status !== UserStatus.SUSPENDED;
  const tooShort = reason.trim().length < MIN_REASON_LENGTH;

  return {
    reason,
    setReason,
    attempted,
    freeze,
    freezing,
    tooShort,
    submit: () => {
      setAttempted(true);
      if (tooShort) return;
      freeze.mutate(
        { frozen: freezing, reason: reason.trim() },
        {
          onSuccess: () => {
            setReason('');
            setAttempted(false);
            onDone();
          },
        },
      );
    },
  };
}

/** Confirms a freeze or a release, with the reason that will be recorded. */
export function FreezeDialog({ customer, open, onClose }: FreezeDialogProps) {
  const { attempted, freeze, freezing, reason, setReason, submit, tooShort } = useFreezeForm(
    customer,
    onClose,
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={freezing ? 'Freeze this customer' : 'Lift the freeze'}
      description={`${customer.firstName} ${customer.lastName} · ${customer.email}`}
      footer={
        <Footer
          freezing={freezing}
          isPending={freeze.isPending}
          onCancel={onClose}
          onConfirm={submit}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Effects freezing={freezing} />

        {freeze.isError && <Alert tone="danger">{failureMessage(freeze.error)}</Alert>}

        <FormField
          label="Reason"
          required
          hint={REASON_HINT}
          error={attempted && tooShort && TOO_SHORT}
        >
          <Textarea
            rows={3}
            value={reason}
            disabled={freeze.isPending}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
