/**
 * Raising a reversal.
 *
 * The dialog shows the operator exactly what will be written before they commit to it —
 * the account, the direction, the amount and the contra leg — because a reversal raised
 * against the wrong side of an entry balances perfectly and is still wrong, and nothing
 * downstream will catch it.
 */

'use client';

import { PostingDirection, type JournalEntry, type Transaction } from '@reliance/contracts';
import { Alert, MoneyText } from '@reliance/ui';

import { ReasonDialog } from '@/components/ops';
import { messageFor } from '@/lib/errors';
import { humaniseCode, shortenId } from '@/lib/format';

import { reversalFor, useRaiseReversal } from './use-journal-entry';

const FIELD = 'flex items-baseline justify-between gap-3 py-1';
const LABEL = 'font-body text-sm text-fg-muted';
const VALUE = 'font-body text-sm text-fg';

export interface ReversalDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly posting: Transaction;
  readonly entry: JournalEntry;
  readonly onRaised: () => void;
}

/** Confirms and raises the opposing entry, for a second operator to approve. */
/** One labelled line of the preview. */
function PreviewRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={FIELD}>
      <span className={LABEL}>{label}</span>
      {children}
    </div>
  );
}

/** Exactly what the opposing entry will say, before anyone approves it. */
function ReversalPreview({
  entry,
  preview,
  opposite,
}: {
  readonly entry: ReversalDialogProps['entry'];
  readonly preview: ReturnType<typeof reversalFor>;
  readonly opposite: string;
}) {
  return (
    <div className="border-border flex flex-col rounded-md border p-3">
      <PreviewRow label="Original entry">
        <span className="text-fg font-mono text-xs">{entry.reference}</span>
      </PreviewRow>
      <PreviewRow label="Account">
        <span className="text-fg font-mono text-xs" title={preview.accountId}>
          {shortenId(preview.accountId)}
        </span>
      </PreviewRow>
      <PreviewRow label="Direction">
        <span className={VALUE}>
          {humaniseCode(preview.direction)} — {opposite} the customer
        </span>
      </PreviewRow>
      <PreviewRow label="Amount">
        <MoneyText
          amount={preview.amount.amount}
          currency={preview.amount.currency}
          size="sm"
          muted
        />
      </PreviewRow>
      <PreviewRow label="Contra ledger account">
        <span className="text-fg font-mono text-xs">{preview.contraLedgerCode}</span>
      </PreviewRow>
    </div>
  );
}

export function ReversalDialog({ open, onClose, posting, entry, onRaised }: ReversalDialogProps) {
  const raise = useRaiseReversal();
  const preview = reversalFor({ entry, posting, justification: 'preview' });
  const opposite =
    preview.direction === PostingDirection.CREDIT ? 'credited back to' : 'debited from';

  const submit = (justification: string): void => {
    raise.mutate(reversalFor({ entry, posting, justification }), {
      onSuccess: () => {
        onRaised();
        onClose();
      },
    });
  };

  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      title="Raise a reversal"
      description="This writes an opposing entry once a second operator approves it. Nothing moves yet."
      confirmLabel="Send for approval"
      onConfirm={submit}
      isSubmitting={raise.isPending}
      error={raise.error ? messageFor(raise.error) : null}
    >
      <ReversalPreview entry={entry} preview={preview} opposite={opposite} />

      <Alert tone="info">
        History is never deleted. The original entry stays on the ledger and this one sits alongside
        it, so a statement produced later still explains both.
      </Alert>
    </ReasonDialog>
  );
}
