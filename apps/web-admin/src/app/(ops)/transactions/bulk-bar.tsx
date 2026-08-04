/**
 * Acting on a selection.
 *
 * Two operations, both of which a real operations desk runs on a list rather than one at
 * a time: reversing a batch that a rail returned, and freezing the funds behind a set of
 * postings while an investigation runs. Neither takes effect on its own — a reversal goes
 * to dual control, and a hold is stated as what it is: value the customer can no longer
 * spend.
 */

'use client';

import { useState } from 'react';

import { HoldReason, type Transaction } from '@reliance/contracts';
import { Alert, Button } from '@reliance/ui';

import { absoluteMinor, ReasonDialog } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount } from '@/lib/format';

import { useBulkOperation, type BulkProgress } from './use-bulk-operation';
import { reversalFor } from './use-journal-entry';

/** Which bulk operation the dialog is currently confirming. */
type Mode = 'reversals' | 'holds' | null;

const HOLD_DESCRIPTION = 'Funds held pending an operations review';

const HOLD_PROMPT =
  "The customer's available balance drops immediately. The ledger balance does not change, " +
  'and nothing is posted.';

const REVERSAL_PROMPT =
  'Each posting is mirrored by an opposing entry, and each one needs a second operator to ' +
  'approve it before any value moves.';

function Outcome({ progress }: Readonly<{ progress: BulkProgress }>) {
  if (progress.total === 0) return null;

  const done = `${formatCount(progress.succeeded)} of ${formatCount(progress.total)} completed`;

  if (progress.failures.length === 0) {
    return <Alert tone={progress.isRunning ? 'info' : 'success'}>{done}.</Alert>;
  }

  return (
    <Alert tone="warning" title={`${done}, ${formatCount(progress.failures.length)} refused`}>
      <ul className="mt-1 flex flex-col gap-1">
        {progress.failures.map((failure) => (
          <li key={failure.label}>
            <span className="font-mono text-xs">{failure.label}</span> — {failure.reason}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

interface SelectionBarProps {
  readonly count: number;
  readonly onReverse: () => void;
  readonly onHold: () => void;
  readonly onClear: () => void;
}

function SelectionBar({ count, onReverse, onHold, onClear }: SelectionBarProps) {
  return (
    <div className="border-border bg-surface-sunken flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
      <span className="font-body text-fg text-sm font-medium">
        {formatCount(count)} posting{count === 1 ? '' : 's'} selected
      </span>
      <span className="flex-1" />
      <Button size="sm" variant="secondary" onClick={onReverse}>
        Raise reversals
      </Button>
      <Button size="sm" variant="secondary" onClick={onHold}>
        Hold the funds
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}

export interface BulkBarProps {
  readonly selected: readonly Transaction[];
  readonly onClear: () => void;
  /** Called once a run finishes, so the queue and the approval count can be re-read. */
  readonly onFinished: () => void;
}

/** The action bar that appears once postings are selected. */
/**
 * The two things the bar can do to a selection, each as a single-posting operation.
 *
 * A reversal has to read the original journal entry first, because the opposing entry is
 * derived from it rather than from the projected transaction row. A hold takes the
 * absolute amount: a debit posting is negative, and holding a negative amount would
 * release funds rather than reserve them.
 */
function useBulkOperations() {
  const client = useApiClient();

  const raiseReversal = async (posting: Transaction, justification: string): Promise<void> => {
    const entry = (await client.admin.journalEntry(posting.journalEntryId)).data;
    await client.admin.manualPosting(reversalFor({ entry, posting, justification }));
  };

  const placeHold = async (posting: Transaction, description: string): Promise<void> => {
    await client.admin.placeHold({
      accountId: posting.accountId,
      amount: { amount: absoluteMinor(posting.amount.amount), currency: posting.amount.currency },
      reason: HoldReason.COMPLIANCE_REVIEW,
      description,
    });
  };

  return { raiseReversal, placeHold };
}

/**
 * One dialog for both operations, worded for whichever was chosen.
 *
 * Holding is the destructive one: it stops the customer spending money they can see, and
 * takes effect immediately. A reversal only raises a request for a second operator.
 */
function BulkReasonDialog({
  mode,
  onClose,
  onConfirm,
  running,
}: {
  readonly mode: Mode;
  readonly onClose: () => void;
  readonly onConfirm: (reason: string) => void;
  readonly running: boolean;
}) {
  const holding = mode === 'holds';

  return (
    <ReasonDialog
      open={mode !== null}
      onClose={onClose}
      title={holding ? 'Hold the funds behind these postings' : 'Raise reversals'}
      description={holding ? `${HOLD_DESCRIPTION}. ${HOLD_PROMPT}` : REVERSAL_PROMPT}
      confirmLabel={holding ? 'Place the holds' : 'Send for approval'}
      destructive={holding}
      onConfirm={onConfirm}
      isSubmitting={running}
    />
  );
}

export function BulkBar({ selected, onClear, onFinished }: BulkBarProps) {
  const bulk = useBulkOperation<Transaction>();
  const { raiseReversal, placeHold } = useBulkOperations();
  const [mode, setMode] = useState<Mode>(null);
  const holding = mode === 'holds';

  const confirm = (reason: string): void => {
    const operation = holding ? placeHold : raiseReversal;
    const finished = bulk.run(
      selected,
      (posting) => operation(posting, reason),
      (posting) => posting.id,
    );
    finished.then(
      () => {
        setMode(null);
        onFinished();
      },
      () => setMode(null),
    );
  };

  if (selected.length === 0) return <Outcome progress={bulk.progress} />;

  return (
    <div className="flex flex-col gap-3">
      <SelectionBar
        count={selected.length}
        onReverse={() => setMode('reversals')}
        onHold={() => setMode('holds')}
        onClear={onClear}
      />
      <Outcome progress={bulk.progress} />
      <BulkReasonDialog
        mode={mode}
        onClose={() => setMode(null)}
        onConfirm={confirm}
        running={bulk.progress.isRunning}
      />
    </div>
  );
}
