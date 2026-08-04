/**
 * Building the report that goes to the financial intelligence unit.
 *
 * A suspicious activity report is a narrative, and the reason they are so often weak is
 * that the analyst starts from a blank box hours after they stopped looking at the
 * evidence. So the builder starts the narrative from what the case already knows — the
 * customer, the alerts that fired, the postings implicated, the notes analysts wrote —
 * and the analyst's job becomes editing a draft rather than remembering a month.
 *
 * Filing is irreversible and the dialog says so. It also sets the case's disposition in
 * the same request, because a filed report and a case still marked "investigating" is the
 * pair of facts that makes an audit go badly.
 */

'use client';

import { useState } from 'react';

import type { AmlAlert, AmlCase } from '@reliance/contracts';
import { Alert, Button, Dialog, FormField, Textarea } from '@reliance/ui';

import { failureMessage } from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';

import { useUpdateAmlCase } from '../data/use-aml';

/** A narrative shorter than this is not a report, it is a note. */
const MIN_NARRATIVE_LENGTH = 120;

const TOO_SHORT =
  'A report needs a narrative a reader outside the bank can follow — at least a few sentences ' +
  'covering who, what, when and why it is suspicious.';

/** Composes the opening draft from everything the case already holds. */
function draftNarrative(investigation: AmlCase, alerts: readonly AmlAlert[]): string {
  const lines = [
    `Subject: ${investigation.customerName} (${investigation.userId}).`,
    `Case ${investigation.reference}, opened ${formatInstant(investigation.openedAt)}, severity ${humaniseCode(investigation.severity)}.`,
    '',
    'Activity that gave rise to the report:',
    ...alerts.map(
      (alert) =>
        `- ${formatInstant(alert.raisedAt)}: ${alert.ruleName} (score ${alert.score}) — ${alert.summary}`,
    ),
    '',
    'Analyst observations:',
    ...investigation.notes.map((note) => `- ${note.authorName}: ${note.body}`),
    '',
    'Why this is suspicious:',
    '',
  ];

  return lines.join('\n');
}

const NARRATIVE_HINT =
  "Drafted from the case's alerts and notes. Edit it into the account you want read.";

/** Rows tall enough that an analyst can see a whole narrative without scrolling. */
const NARRATIVE_ROWS = 16;

interface NarrativeEditorProps {
  readonly narrative: string;
  readonly error: string | null;
  readonly fieldError: string | null;
  readonly disabled: boolean;
  readonly onChange: (narrative: string) => void;
}

function NarrativeEditor(props: NarrativeEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      {props.error && <Alert tone="danger">{props.error}</Alert>}

      <Alert tone="warning" title="Do not tell the customer">
        Informing the subject that a report has been made is a criminal offence. Nothing about this
        filing is visible to the customer, and nothing about it may be discussed with them.
      </Alert>

      <FormField label="Narrative" required hint={NARRATIVE_HINT} error={props.fieldError}>
        <Textarea
          rows={NARRATIVE_ROWS}
          value={props.narrative}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </FormField>
    </div>
  );
}

export interface SarBuilderProps {
  readonly investigation: AmlCase;
  /** The alerts attached to this case, for the draft narrative. */
  readonly alerts: readonly AmlAlert[];
  readonly open: boolean;
  readonly onClose: () => void;
}

/** The narrative draft and the filing behind the confirm button. */
function useReport(props: SarBuilderProps) {
  const [narrative, setNarrative] = useState(() =>
    draftNarrative(props.investigation, props.alerts),
  );
  const [attempted, setAttempted] = useState(false);
  const update = useUpdateAmlCase();
  const tooShort = narrative.trim().length < MIN_NARRATIVE_LENGTH;

  return {
    narrative,
    setNarrative,
    attempted,
    update,
    tooShort,
    file: () => {
      setAttempted(true);
      if (tooShort) return;
      update.mutate(
        {
          caseId: props.investigation.id,
          status: 'REPORTED',
          disposition: 'REPORTED',
          note: narrative.trim(),
        },
        { onSuccess: props.onClose },
      );
    },
  };
}

/** Drafts and files a suspicious activity report. */
export function SarBuilder(props: SarBuilderProps) {
  const { investigation, open, onClose } = props;
  const { attempted, file, narrative, setNarrative, tooShort, update } = useReport(props);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Report for case ${investigation.reference}`}
      description="Filing sends this narrative to the financial intelligence unit and closes the case as reported. It cannot be withdrawn."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button loading={update.isPending} onClick={file}>
            File the report
          </Button>
        </>
      }
    >
      <NarrativeEditor
        narrative={narrative}
        error={update.isError ? failureMessage(update.error) : null}
        fieldError={attempted && tooShort ? TOO_SHORT : null}
        disabled={update.isPending}
        onChange={setNarrative}
      />
    </Dialog>
  );
}
