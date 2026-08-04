/**
 * Approve or reject, with a reason.
 *
 * The reason is required for both outcomes, not only refusals. A rejection with no
 * explanation is unfair to the customer; an approval with no explanation is worse for the
 * bank, because it is the approvals that get read back years later by a regulator asking
 * why the money was allowed to move. The field is the record, so it is mandatory.
 *
 * The panel refuses locally what the platform would refuse anyway — an empty reason, a
 * decision the operator is not allowed to make, a request they raised themselves — so the
 * operator learns before they commit rather than after.
 */

'use client';

import { Check, X } from 'lucide-react';
import { useState } from 'react';

import { Alert, Button, FormField, Textarea } from '@reliance/ui';

/** The two things an approver can do. */
export type DecisionOutcome = 'APPROVE' | 'REJECT';

/** Short enough to type, long enough to be a sentence rather than "ok". */
const MIN_REASON_LENGTH = 12;

const REASON_TOO_SHORT = `Say why in at least ${MIN_REASON_LENGTH} characters. This is the record of the decision.`;

export interface DecisionPanelProps {
  /** Heading for the panel. Defaults to a neutral prompt. */
  readonly title?: string;
  readonly approveLabel?: string;
  readonly rejectLabel?: string;
  /** Called only once a reason has been given. */
  readonly onDecide: (outcome: DecisionOutcome, reason: string) => void;
  readonly isDeciding?: boolean;
  /** A failure from the platform, already in plain language. */
  readonly error?: string | null;
  /**
   * Why this operator cannot decide — "You raised this request", "Your role does not
   * allow approvals". Set it and the controls are disabled with the reason on screen,
   * which is far more use than a button that fails when pressed.
   */
  readonly blockedReason?: string | null;
}

/** The approve/reject control for a queue item. */
export function DecisionPanel(props: DecisionPanelProps) {
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);

  const tooShort = reason.trim().length < MIN_REASON_LENGTH;
  const blocked = Boolean(props.blockedReason);

  const decide = (outcome: DecisionOutcome): void => {
    setAttempted(true);
    if (tooShort || blocked) return;
    props.onDecide(outcome, reason.trim());
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-sm font-semibold">{props.title ?? 'Your decision'}</h3>

      {props.blockedReason && <Alert tone="warning">{props.blockedReason}</Alert>}
      {props.error && <Alert tone="danger">{props.error}</Alert>}

      <FormField
        label="Reason"
        required
        hint="Recorded against your staff account and shown in the audit trail."
        error={attempted && tooShort && REASON_TOO_SHORT}
      >
        <Textarea
          rows={3}
          value={reason}
          disabled={blocked || props.isDeciding}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>

      <DecisionButtons
        approveLabel={props.approveLabel ?? 'Approve'}
        rejectLabel={props.rejectLabel ?? 'Reject'}
        blocked={blocked}
        busy={Boolean(props.isDeciding)}
        onDecide={decide}
      />
    </div>
  );
}

interface DecisionButtonsProps {
  readonly approveLabel: string;
  readonly rejectLabel: string;
  readonly blocked: boolean;
  readonly busy: boolean;
  readonly onDecide: (outcome: DecisionOutcome) => void;
}

function DecisionButtons(props: DecisionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="primary"
        disabled={props.blocked}
        loading={props.busy}
        onClick={() => props.onDecide('APPROVE')}
        startIcon={<Check className="size-4" />}
      >
        {props.approveLabel}
      </Button>
      <Button
        variant="danger"
        disabled={props.blocked || props.busy}
        onClick={() => props.onDecide('REJECT')}
        startIcon={<X className="size-4" />}
      >
        {props.rejectLabel}
      </Button>
    </div>
  );
}
