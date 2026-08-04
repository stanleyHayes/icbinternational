/**
 * Confirming an action that has to be explained.
 *
 * Reversals, write-offs, releases of a court-ordered hold: each moves value or removes a
 * control, and each is read back later by somebody asking why. The reason is therefore
 * part of the action rather than a note somebody might add afterwards, and the dialog
 * will not submit without one.
 */

'use client';

import { useState } from 'react';

import { Alert, Dialog, FormField, Textarea } from '@reliance/ui';

import { DialogActions } from './dialog-actions';

/** Long enough to be a sentence rather than "ok". Matches the approval panel's floor. */
const MIN_REASON_LENGTH = 12;

const TOO_SHORT = `Say why in at least ${MIN_REASON_LENGTH} characters. This is the record of the decision.`;

export interface ReasonDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  /** What the operator is about to do, and what it will change. */
  readonly description: string;
  readonly confirmLabel: string;
  /** Renders the confirm control in the destructive style. */
  readonly destructive?: boolean;
  readonly onConfirm: (reason: string) => void;
  readonly isSubmitting?: boolean;
  /** A refusal from the platform, already in the bank's words. */
  readonly error?: string | null;
  /** Extra fields shown above the reason — an amount, a date, a target account. */
  readonly children?: React.ReactNode;
}

/** A confirmation that records why. */
/**
 * The reason being typed, cleared each time the dialog opens.
 *
 * `attempted` gates the validation message so the field is not red before anyone has
 * tried: the requirement is announced by the hint, and only becomes an error once the
 * operator has pressed confirm without meeting it.
 */
function useReason(open: boolean, onConfirm: (reason: string) => void) {
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const tooShort = reason.trim().length < MIN_REASON_LENGTH;

  // Reopening the dialog for a different record must not inherit the last reason typed.
  // Adjusted during render rather than in an effect: an effect would paint the previous
  // record's reason for a frame before clearing it, which is both a flash of the wrong
  // text and the cascading render React warns about.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason('');
      setAttempted(false);
    }
  }

  const confirm = (): void => {
    setAttempted(true);
    if (tooShort) return;
    onConfirm(reason.trim());
  };

  return { reason, setReason, attempted, tooShort, confirm };
}

/** The reason itself. Every destructive action in the console is recorded with one. */
function ReasonField({
  reason,
  onReason,
  disabled,
  showError,
}: {
  readonly reason: string;
  readonly onReason: (next: string) => void;
  readonly disabled: boolean;
  readonly showError: boolean;
}) {
  return (
    <FormField
      label="Reason"
      required
      hint="Recorded against your staff account and shown in the audit trail."
      error={showError && TOO_SHORT}
    >
      <Textarea
        rows={3}
        value={reason}
        disabled={disabled}
        onChange={(event) => onReason(event.target.value)}
      />
    </FormField>
  );
}

export function ReasonDialog(props: ReasonDialogProps) {
  const { reason, setReason, attempted, tooShort, confirm } = useReason(
    props.open,
    props.onConfirm,
  );

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      description={props.description}
      footer={
        <DialogActions
          confirmLabel={props.confirmLabel}
          onCancel={props.onClose}
          onConfirm={confirm}
          pending={props.isSubmitting}
          {...(props.destructive ? { destructive: true } : {})}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {props.error && <Alert tone="danger">{props.error}</Alert>}
        {props.children}
        <ReasonField
          reason={reason}
          onReason={setReason}
          disabled={props.isSubmitting ?? false}
          showError={attempted && tooShort}
        />
      </div>
    </Dialog>
  );
}
