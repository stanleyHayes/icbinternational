/**
 * One investigation, and everything that belongs to it.
 *
 * An investigation is a decision waiting to be justified, so the workspace puts the
 * justification material — the alerts, the notes, the evidence count — above the controls
 * that end it. The disposition and the report cannot be reached without scrolling past
 * what they are supposed to be based on.
 */

'use client';

import { FileText } from 'lucide-react';
import { useState } from 'react';

import { Permission, type AmlAlert, type AmlCase } from '@reliance/contracts';
import { Alert, Badge, Button, EmptyState, FormField, Select, StatusPill } from '@reliance/ui';

import {
  caseTone,
  failureMessage,
  NoteThread,
  ScreenPanel,
  severityTone,
} from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';
import { useAdminSession } from '@/lib/session';

import { useUpdateAmlCase } from '../data/use-aml';

import { SarBuilder } from './sar-builder';

const DISPOSITIONS = [
  { value: 'NO_ACTION', label: 'No action — the behaviour is explained' },
  { value: 'MONITOR', label: 'Monitor — keep watching this customer' },
  { value: 'RESTRICT', label: 'Restrict — limit what the customer can do' },
  { value: 'EXIT', label: 'Exit — end the relationship' },
];

function Header({ investigation }: Readonly<{ investigation: AmlCase }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill
        tone={caseTone(investigation.status)}
        label={humaniseCode(investigation.status)}
      />
      <Badge tone={severityTone(investigation.severity)}>
        {humaniseCode(investigation.severity)}
      </Badge>
      <span className="font-body text-fg text-sm font-medium">{investigation.customerName}</span>
      <span className="text-fg-subtle font-mono text-xs">{investigation.reference}</span>
      <span className="font-body text-fg-muted text-xs">
        opened {formatInstant(investigation.openedAt)} · {investigation.evidenceIds.length} evidence
        item{investigation.evidenceIds.length === 1 ? '' : 's'}
      </span>
      {investigation.suspiciousActivityReportFiled && <Badge tone="danger">Report filed</Badge>}
    </div>
  );
}

interface AttachedAlertsProps {
  readonly investigation: AmlCase;
  readonly alerts: readonly AmlAlert[];
}

function AttachedAlerts({ investigation, alerts }: AttachedAlertsProps) {
  if (alerts.length === 0) {
    return (
      <p className="font-body text-fg-muted text-sm">
        No monitoring alert is attached to this investigation yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex flex-wrap items-center gap-2">
          <Badge tone={severityTone(alert.severity)}>{humaniseCode(alert.severity)}</Badge>
          <span className="font-body text-fg text-sm">{alert.ruleName}</span>
          <span className="font-body text-fg-muted text-xs">{alert.summary}</span>
          <span className="text-fg-subtle font-mono text-xs">{formatInstant(alert.raisedAt)}</span>
        </li>
      ))}
      <li className="font-body text-fg-subtle mt-1 text-xs">
        {investigation.alertIds.length} alert
        {investigation.alertIds.length === 1 ? '' : 's'} recorded against this case.
      </li>
    </ul>
  );
}

interface OutcomeControlsProps {
  readonly disposition: string;
  readonly isSaving: boolean;
  readonly onDispositionChange: (disposition: string) => void;
  readonly onClose: () => void;
  readonly onReport: () => void;
}

function OutcomeControls(props: OutcomeControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField label="Disposition" className="min-w-72">
        <Select
          value={props.disposition}
          placeholder="Choose a disposition"
          options={DISPOSITIONS}
          onChange={(event) => props.onDispositionChange(event.target.value)}
        />
      </FormField>
      <Button disabled={props.disposition === ''} loading={props.isSaving} onClick={props.onClose}>
        Close this investigation
      </Button>
      <Button variant="danger" startIcon={<FileText className="size-4" />} onClick={props.onReport}>
        Report suspicious activity
      </Button>
    </div>
  );
}

export interface CaseWorkspaceProps {
  readonly investigation: AmlCase | null;
  /** Every alert the console has loaded, filtered here to those on this case. */
  readonly alerts: readonly AmlAlert[];
}

interface AlertsPanelProps {
  readonly investigation: AmlCase;
  readonly alerts: readonly AmlAlert[];
  /** The signed-in operator's id, when taking the case is available. */
  readonly assignName: string | null;
  readonly isSaving: boolean;
  readonly onAssign: (assignedToId: string) => void;
}

function AlertsPanel(props: AlertsPanelProps) {
  return (
    <ScreenPanel
      title="Alerts on this case"
      actions={
        props.assignName && (
          <Button
            size="sm"
            variant="ghost"
            loading={props.isSaving}
            onClick={() => props.onAssign(props.assignName ?? '')}
          >
            Assign to me
          </Button>
        )
      }
    >
      <AttachedAlerts investigation={props.investigation} alerts={props.alerts} />
    </ScreenPanel>
  );
}

interface RecordPanelsProps {
  readonly investigation: AmlCase;
  readonly canDecide: boolean;
  readonly disposition: string;
  readonly isSaving: boolean;
  readonly onNote: (note: string) => void;
  readonly onDispositionChange: (disposition: string) => void;
  readonly onClose: () => void;
  readonly onReport: () => void;
}

function RecordPanels(props: RecordPanelsProps) {
  return (
    <>
      <ScreenPanel title="Investigation record">
        <NoteThread
          notes={props.investigation.notes}
          isAdding={props.isSaving}
          readOnly={!props.canDecide}
          onAdd={props.onNote}
        />
      </ScreenPanel>

      {props.canDecide && (
        <ScreenPanel title="Outcome">
          <OutcomeControls
            disposition={props.disposition}
            isSaving={props.isSaving}
            onDispositionChange={props.onDispositionChange}
            onClose={props.onClose}
            onReport={props.onReport}
          />
        </ScreenPanel>
      )}
    </>
  );
}

function NothingSelected() {
  return (
    <EmptyState
      title="Choose an investigation"
      description="Select a case to read its alerts, add to the record, and decide what happens to the customer."
    />
  );
}

/** The investigation workspace. */
export function CaseWorkspace({ investigation, alerts }: CaseWorkspaceProps) {
  const permissions = usePermissions();
  const { operator } = useAdminSession();
  const [disposition, setDisposition] = useState('');
  const [reporting, setReporting] = useState(false);
  const update = useUpdateAmlCase();

  if (!investigation) return <NothingSelected />;

  const attached = alerts.filter((alert) => investigation.alertIds.includes(alert.id));
  const canDecide = permissions.has(Permission.AML_DECIDE);
  const mine = operator !== null && investigation.assignedToId === operator.id;

  return (
    <div className="flex flex-col gap-4">
      <Header investigation={investigation} />

      {update.isError && <Alert tone="danger">{failureMessage(update.error)}</Alert>}

      <AlertsPanel
        investigation={investigation}
        alerts={attached}
        assignName={!mine && operator ? operator.id : null}
        isSaving={update.isPending}
        onAssign={(assignedToId) => update.mutate({ caseId: investigation.id, assignedToId })}
      />

      <RecordPanels
        investigation={investigation}
        canDecide={canDecide}
        disposition={disposition}
        isSaving={update.isPending}
        onNote={(note) => update.mutate({ caseId: investigation.id, note })}
        onDispositionChange={setDisposition}
        onClose={() => update.mutate({ caseId: investigation.id, disposition, status: 'CLOSED' })}
        onReport={() => setReporting(true)}
      />

      <SarBuilder
        investigation={investigation}
        alerts={attached}
        open={reporting}
        onClose={() => setReporting(false)}
      />
    </div>
  );
}
