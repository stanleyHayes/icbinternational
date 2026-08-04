/**
 * Everything that has happened to this record, and everything staff have written about it.
 *
 * The timeline is the audit chain itself, not a prettier copy of it, so the chain's
 * integrity check runs on exactly the events on screen. If a link is broken the panel says
 * so before an operator reads a single line — a history you cannot trust is worse than no
 * history, because it looks the same.
 *
 * Notes hang off the customer's open investigation rather than off the customer. That is
 * the only place the platform will keep them, and it is arguably the right place: a note
 * worth writing about a customer is a note about something the bank is looking into, and
 * one attached to an investigation travels with the evidence when the case is reviewed.
 */

'use client';

import { FileSearch } from 'lucide-react';

import { Alert, EmptyState } from '@reliance/ui';

import { useUpdateAmlCase } from '@/components/compliance/data/use-aml';
import {
  failureMessage,
  NoteThread,
  QueueError,
  QueueLoading,
  ScreenPanel,
} from '@/components/compliance/kit';
import { AuditTrail } from '@/components/shell/ops';

import { useCustomerRisk } from '../data/use-customer-risk';
import { useCustomerHistory } from '../data/use-dossier';

/** Investigations still open enough to take a note. */
const CLOSED_STATES = new Set(['CLOSED', 'REPORTED']);

function NotesPanel({ customerId }: Readonly<{ customerId: string }>) {
  const risk = useCustomerRisk(customerId);
  const update = useUpdateAmlCase();

  const investigation = risk.data?.cases.find((candidate) => !CLOSED_STATES.has(candidate.status));

  if (risk.isPending) return <QueueLoading label="investigation notes" />;

  if (!investigation) {
    return (
      <EmptyState
        icon={<FileSearch className="size-5" />}
        title="No open investigation to note against"
        description="Notes are kept with the investigation they belong to. Escalate a monitoring alert to open one."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-body text-fg-muted text-xs">
        Notes on investigation {investigation.reference}.
      </p>
      {update.isError && <Alert tone="danger">{failureMessage(update.error)}</Alert>}
      <NoteThread
        notes={investigation.notes}
        isAdding={update.isPending}
        onAdd={(body) => update.mutate({ caseId: investigation.id, note: body })}
      />
    </div>
  );
}

/** The audit chain for this customer, plus the notes staff have left. */
export function TimelineTab({ customerId }: Readonly<{ customerId: string }>) {
  const history = useCustomerHistory(customerId);

  return (
    <div className="flex flex-col gap-4">
      <ScreenPanel title="Record history" flush>
        {history.isError ? (
          <QueueError
            error={history.error}
            subject="this customer's history"
            onRetry={history.refetch}
          />
        ) : (
          <AuditTrail
            events={history.data ?? []}
            isLoading={history.isPending}
            subject="this customer"
          />
        )}
      </ScreenPanel>

      <ScreenPanel title="Analyst notes">
        <NotesPanel customerId={customerId} />
      </ScreenPanel>
    </div>
  );
}
