/**
 * Deciding what one monitoring alert means.
 *
 * Triage is recorded against the investigation the alert belongs to, not against the
 * alert. That is how the platform models it and it is also the more useful record: three
 * alerts on one customer are one story, and a disposition written on each of them
 * separately loses the story.
 *
 * An alert with no investigation attached cannot be disposed of from here, and the panel
 * says so rather than offering a control that will fail. Attaching it writes a note on
 * the chosen investigation naming the alert, which is what makes the link auditable.
 */

'use client';

import { useState } from 'react';

import { Permission, type AmlAlert, type AmlCase } from '@reliance/contracts';
import { Alert, Badge, Button, EmptyState, FormField, Select, StatusPill } from '@reliance/ui';

import { caseTone, failureMessage, NoteThread, severityTone } from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';
import { useAdminSession } from '@/lib/session';

import { useUpdateAmlCase } from '../data/use-aml';

/** What an analyst concluded, in the platform's vocabulary. */
const DISPOSITIONS = [
  { value: 'NO_ACTION', label: 'No action — the behaviour is explained' },
  { value: 'MONITOR', label: 'Monitor — keep watching this customer' },
  { value: 'RESTRICT', label: 'Restrict — limit what the customer can do' },
  { value: 'EXIT', label: 'Exit — end the relationship' },
  { value: 'REPORTED', label: 'Reported — a suspicious activity report has been filed' },
];

const CANNOT_DECIDE = 'Your role lets you read monitoring alerts but not dispose of them.';

export interface AlertTriageProps {
  readonly alert: AmlAlert | null;
  /** Every investigation the console has loaded, for attaching and for context. */
  readonly investigations: readonly AmlCase[];
}

function AlertSummary({ alert }: Readonly<{ alert: AmlAlert }>) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={severityTone(alert.severity)}>{humaniseCode(alert.severity)}</Badge>
        <span className="font-body text-fg text-sm font-medium">{alert.ruleName}</span>
        <span className="text-fg-subtle font-mono text-xs">score {alert.score}</span>
      </div>
      <p className="font-body text-fg-muted text-sm">{alert.summary}</p>
      <p className="font-body text-fg-subtle text-xs">
        Raised {formatInstant(alert.raisedAt)} against {alert.customerName} ·{' '}
        {alert.relatedTransactionIds.length} posting
        {alert.relatedTransactionIds.length === 1 ? '' : 's'} implicated
      </p>
    </div>
  );
}

/** One investigation as a select option. */
function caseOption(record: AmlCase) {
  return { value: record.id, label: `${record.reference} — ${humaniseCode(record.status)}` };
}

interface AttachPanelProps {
  readonly alert: AmlAlert;
  readonly investigations: readonly AmlCase[];
}

function AttachPanel({ alert, investigations }: AttachPanelProps) {
  const [caseId, setCaseId] = useState('');
  const update = useUpdateAmlCase();
  const candidates = investigations.filter((record) => record.userId === alert.userId);

  if (candidates.length === 0) {
    return (
      <Alert tone="info" title="No investigation for this customer">
        This alert cannot be disposed of until it belongs to an investigation. Open one from the
        investigations workspace and attach the alert here.
      </Alert>
    );
  }

  const note = `Attached monitoring alert ${alert.id} (${alert.ruleName}, score ${alert.score}).`;

  return (
    <div className="flex flex-col gap-3">
      {update.isError && <Alert tone="danger">{failureMessage(update.error)}</Alert>}
      <FormField label="Attach to an investigation" required>
        <Select
          value={caseId}
          placeholder="Choose an investigation"
          options={candidates.map(caseOption)}
          onChange={(event) => setCaseId(event.target.value)}
        />
      </FormField>
      <div>
        <Button
          disabled={caseId === ''}
          loading={update.isPending}
          onClick={() => update.mutate({ caseId, note })}
        >
          Attach this alert
        </Button>
      </div>
    </div>
  );
}

interface DisposePanelProps {
  readonly investigation: AmlCase;
  readonly canDecide: boolean;
  readonly operatorId: string | null;
}

function DisposePanel({ investigation, canDecide, operatorId }: DisposePanelProps) {
  const [disposition, setDisposition] = useState('');
  const update = useUpdateAmlCase();
  const assignedToMe = operatorId !== null && investigation.assignedToId === operatorId;

  return (
    <div className="flex flex-col gap-3">
      <CaseHeader
        investigation={investigation}
        assignedToMe={assignedToMe}
        operatorId={operatorId}
        isSaving={update.isPending}
        onAssign={() => update.mutate({ caseId: investigation.id, assignedToId: operatorId ?? '' })}
      />

      {update.isError && <Alert tone="danger">{failureMessage(update.error)}</Alert>}

      <NoteThread
        notes={investigation.notes}
        isAdding={update.isPending}
        readOnly={!canDecide}
        onAdd={(body) => update.mutate({ caseId: investigation.id, note: body })}
      />

      {canDecide ? (
        <DispositionRow
          value={disposition}
          isSaving={update.isPending}
          onChange={setDisposition}
          onClose={() => update.mutate({ caseId: investigation.id, disposition, status: 'CLOSED' })}
        />
      ) : (
        <Alert tone="warning">{CANNOT_DECIDE}</Alert>
      )}
    </div>
  );
}

interface CaseHeaderProps {
  readonly investigation: AmlCase;
  readonly assignedToMe: boolean;
  readonly operatorId: string | null;
  readonly isSaving: boolean;
  readonly onAssign: () => void;
}

function CaseHeader(props: CaseHeaderProps) {
  const { investigation } = props;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill
        tone={caseTone(investigation.status)}
        label={humaniseCode(investigation.status)}
      />
      <span className="font-body text-fg text-sm">Investigation {investigation.reference}</span>
      {!props.assignedToMe && props.operatorId && (
        <Button size="sm" variant="ghost" loading={props.isSaving} onClick={props.onAssign}>
          Assign to me
        </Button>
      )}
    </div>
  );
}

interface DispositionRowProps {
  readonly value: string;
  readonly isSaving: boolean;
  readonly onChange: (disposition: string) => void;
  readonly onClose: () => void;
}

function DispositionRow(props: DispositionRowProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <FormField label="Disposition" className="min-w-72">
        <Select
          value={props.value}
          placeholder="Choose a disposition"
          options={DISPOSITIONS}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </FormField>
      <Button disabled={props.value === ''} loading={props.isSaving} onClick={props.onClose}>
        Close the investigation
      </Button>
    </div>
  );
}

function NothingSelected() {
  return (
    <EmptyState
      title="Choose an alert to triage"
      description="Select a row to read what fired, and record what you concluded."
    />
  );
}

/** The triage panel for one monitoring alert. */
export function AlertTriage({ alert, investigations }: AlertTriageProps) {
  const permissions = usePermissions();
  const { operator } = useAdminSession();

  if (!alert) return <NothingSelected />;

  const investigation = investigations.find((record) => record.id === alert.caseId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <AlertSummary alert={alert} />
      {investigation ? (
        <DisposePanel
          investigation={investigation}
          canDecide={permissions.has(Permission.AML_DECIDE)}
          operatorId={operator?.id ?? null}
        />
      ) : (
        <AttachPanel alert={alert} investigations={investigations} />
      )}
    </div>
  );
}
