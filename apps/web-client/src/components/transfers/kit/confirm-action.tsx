'use client';

/**
 * Confirming something that cannot be undone.
 *
 * Two guarantees, both of which exist because of how these go wrong. The dialog states the
 * consequence in the customer's own terms — "Your card will stop working immediately" — rather
 * than asking "Are you sure?", which is a question nobody has ever answered thoughtfully. And when
 * `stepUpReason` is set, the bank re-authenticates before the action runs, so a walk-away session
 * cannot be used to close an account.
 *
 * Cancelling the step-up prompt closes the dialog quietly. It is a decision, not a failure.
 */

import { useState, type ReactNode } from 'react';

import { withStepUpToken } from '@reliance/api-client';
import { Alert, Button, Dialog } from '@reliance/ui';

import { StepUpCancelled, useStepUp } from '@/components/shell';
import { describeError } from '@/lib/errors';

/** What a confirmed action receives. */
export type ConfirmedAction = (options: { readonly stepUpToken?: string }) => Promise<void>;

/** Props for {@link ConfirmAction}. */
export interface ConfirmActionProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Names the decision — "Close this account". */
  readonly title: string;
  /** What will happen, stated plainly. Not a question. */
  readonly consequence: ReactNode;
  /** Label of the confirming button. A verb: "Close account", never "OK". */
  readonly confirmLabel: string;
  /** Renders the confirming button in the destructive style. */
  readonly destructive?: boolean;
  /**
   * Requires re-authentication first, phrased in the second person: `'close your account'`.
   * Omit for a confirmation that is merely irreversible rather than sensitive.
   */
  readonly stepUpReason?: string;
  /** Runs once the customer confirms and any step-up has succeeded. */
  readonly onConfirm: ConfirmedAction;
  /** Extra detail inside the dialog — a penalty figure, a summary of what is being cancelled. */
  readonly children?: ReactNode;
}

/**
 * @example
 * <ConfirmAction
 *   open={open}
 *   onClose={close}
 *   title="Cancel this standing order"
 *   consequence="No further payments will be taken. Payments already sent are unaffected."
 *   confirmLabel="Cancel standing order"
 *   destructive
 *   onConfirm={async () => { await api.transferOrders.cancel(id); }}
 * />
 */
export function ConfirmAction(props: ConfirmActionProps) {
  const { open, onClose, title, consequence, confirmLabel, destructive, children } = props;
  const stepUp = useStepUp();
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async (): Promise<void> => {
    setFailure(null);
    setBusy(true);
    try {
      const token = props.stepUpReason ? await stepUp.authorise(props.stepUpReason) : undefined;
      await props.onConfirm(token ? { stepUpToken: token } : {});
      onClose();
    } catch (error) {
      if (!(error instanceof StepUpCancelled)) setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <div className="flex w-full justify-end gap-3">
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        Keep as it is
      </Button>
      <Button
        variant={destructive ? 'danger' : 'primary'}
        loading={busy}
        onClick={() => void confirm()}
      >
        {confirmLabel}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onClose={onClose} title={title} description={consequence} footer={footer}>
      {children}
      <FailureNotice failure={failure} />
    </Dialog>
  );
}

/** The reason a confirmed action was refused, in the bank's voice. */
function FailureNotice({ failure }: { readonly failure: unknown }) {
  if (!failure) return null;
  const described = describeError(failure);

  return (
    <Alert tone="danger" className="mt-4" title={described.title}>
      {described.message}
    </Alert>
  );
}

/** Attaches a step-up grant to a single request, when one was needed. */
export function stepUpOptions(token: string | undefined) {
  return token ? withStepUpToken(token) : undefined;
}
