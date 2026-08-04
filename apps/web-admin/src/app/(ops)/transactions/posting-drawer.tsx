/**
 * One posting, opened.
 *
 * The customer's side is at the top because that is what the operator was searching for,
 * and the entry underneath it is what actually happened. Both are on the same panel: an
 * operator who has to navigate away to see the other half of a movement will stop
 * checking it.
 */

'use client';

import { useState } from 'react';

import { Permission, type Transaction } from '@reliance/contracts';
import { Button, MoneyText, StatusPill } from '@reliance/ui';

import { JournalEntryView } from '@/components/finance';
import { AsyncState, toneForTransaction } from '@/components/ops';
import { DetailDrawer, DetailField, DetailSection } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';

import { ReversalDialog } from './reversal-dialog';
import { useJournalEntry } from './use-journal-entry';

export interface PostingDrawerProps {
  readonly posting: Transaction | null;
  readonly onClose: () => void;
  /** Called once a reversal has been raised, so the queue can be re-read. */
  readonly onReversalRaised: () => void;
}

function CustomerSide({ posting }: Readonly<{ posting: Transaction }>) {
  return (
    <DetailSection title="Customer view">
      <DetailField label="Narrative">{posting.description}</DetailField>
      <DetailField label="Counterparty">
        {posting.counterparty?.name ?? 'None recorded'}
      </DetailField>
      <DetailField label="Amount">
        <MoneyText
          amount={posting.amount.amount}
          currency={posting.amount.currency}
          signed
          size="sm"
        />
      </DetailField>
      <DetailField label="Balance after">
        <MoneyText
          amount={posting.runningBalance.amount}
          currency={posting.runningBalance.currency}
          size="sm"
          muted
        />
      </DetailField>
      <DetailField label="Account" mono>
        {posting.accountId}
      </DetailField>
      <DetailField label="Reference" mono>
        {posting.reference ?? '—'}
      </DetailField>
      <DetailField label="Category">{humaniseCode(posting.category)}</DetailField>
      <DetailField label="Booked">{formatInstant(posting.bookedAt)}</DetailField>
      <DetailField label="Completed">{formatInstant(posting.completedAt)}</DetailField>
    </DetailSection>
  );
}

type EntryQuery = ReturnType<typeof useJournalEntry>;

function EntrySection({ entry, active }: Readonly<{ entry: EntryQuery; active: boolean }>) {
  return (
    <DetailSection title="Journal entry">
      <div className="col-span-2">
        <AsyncState
          isLoading={entry.isPending && active}
          error={entry.error}
          onRetry={() => {
            entry.refetch();
          }}
          subject="the journal entry behind this posting"
        >
          {entry.data && <JournalEntryView entry={entry.data} />}
        </AsyncState>
      </div>
    </DetailSection>
  );
}

function PostingStatus({ posting }: Readonly<{ posting: Transaction }>) {
  return (
    <StatusPill tone={toneForTransaction(posting.status)} label={humaniseCode(posting.status)} />
  );
}

/** The posting, the entry beneath it, and the reversal control. */
export function PostingDrawer({ posting, onClose, onReversalRaised }: PostingDrawerProps) {
  const [reversing, setReversing] = useState(false);
  const entry = useJournalEntry(posting?.journalEntryId ?? null);

  return (
    <DetailDrawer
      open={posting !== null}
      onClose={onClose}
      title="Posting"
      subtitle={posting ? <PostingStatus posting={posting} /> : undefined}
      recordId={posting?.id}
      footer={
        <Can permission={Permission.TRANSACTION_REVERSE}>
          <Button variant="danger" onClick={() => setReversing(true)} disabled={!entry.data}>
            Raise a reversal
          </Button>
        </Can>
      }
    >
      {posting && <CustomerSide posting={posting} />}
      <EntrySection entry={entry} active={posting !== null} />

      {posting && entry.data && (
        <ReversalDialog
          open={reversing}
          onClose={() => setReversing(false)}
          posting={posting}
          entry={entry.data}
          onRaised={onReversalRaised}
        />
      )}
    </DetailDrawer>
  );
}
