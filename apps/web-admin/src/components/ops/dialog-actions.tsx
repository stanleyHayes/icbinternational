/**
 * The cancel/confirm pair every dialog in the console ends with.
 *
 * Six dialogs had spelled out the same twelve lines, and they had already drifted: some
 * disabled Cancel while the write was in flight and some did not, which is the difference
 * between a dialog you can escape mid-request and one you cannot. Naming the pattern makes
 * that a decision taken once.
 *
 * Cancel is disabled while pending on purpose. Closing the dialog does not cancel the
 * request behind it, so a dialog that vanishes mid-write leaves the operator with no way
 * to know whether it landed.
 */

'use client';

import { Button } from '@reliance/ui';

export interface DialogActionsProps {
  /** The affirmative verb, e.g. "Place the hold". Never just "OK". */
  readonly confirmLabel: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  /** A write is in flight: the confirm spins and neither button is clickable. */
  readonly pending?: boolean;
  /** The form is incomplete. Distinct from `pending` — this one is the caller's rule. */
  readonly disabled?: boolean;
  /** Renders the confirm in the danger tone. For anything a customer would feel. */
  readonly destructive?: boolean;
}

export function DialogActions({
  confirmLabel,
  onCancel,
  onConfirm,
  pending = false,
  disabled = false,
  destructive = false,
}: DialogActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button
        variant={destructive ? 'danger' : 'primary'}
        onClick={onConfirm}
        loading={pending}
        disabled={disabled}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}
