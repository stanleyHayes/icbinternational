/**
 * A refusal that can be defended.
 *
 * The shell's `DecisionPanel` covers approve-or-reject with a sentence, which is right
 * where the outcome is binary. Identity review is not: an analyst can approve, refuse, or
 * hand the case back to the customer, and the last two must carry a reportable code as
 * well as prose. Picking the code fills the customer-facing wording in, and the analyst
 * edits it rather than writing from nothing — which is how the letter stays in the bank's
 * voice at four in the afternoon on a Friday.
 *
 * The wording is shown as what it is: the words the customer will read. An analyst who
 * can see that is far more careful than one typing into a box labelled "notes".
 */

'use client';

import { useState } from 'react';

import { Alert, Button, FormField, Select, Textarea } from '@reliance/ui';

import { findReason, reasonOptions, type ReasonCode } from './reason-codes';

/** Long enough that a code plus a sentence is a genuine explanation. */
const MIN_WORDING_LENGTH = 20;

const NO_REASON = 'Choose the reason that best describes the decision.';
const TOO_SHORT = `Write at least ${MIN_WORDING_LENGTH} characters explaining the decision.`;

const WORDING_HINT =
  'Sent to the customer word for word, and kept with the decision in the audit trail.';

/** The decision an analyst reached, ready to be sent. */
export interface ReasonedDecision {
  readonly code: string;
  /** The wording the customer will be shown, as edited by the analyst. */
  readonly wording: string;
}

export interface ReasonedDecisionFormProps {
  /** Label on the submit button — "Refuse the application", "Ask for more". */
  readonly submitLabel: string;
  /** Tone of the submit button. Refusals are destructive; requests for more are not. */
  readonly destructive?: boolean;
  readonly reasons: readonly ReasonCode[];
  /** Heading above the customer-facing wording, e.g. "What the customer will be told". */
  readonly wordingLabel: string;
  readonly onSubmit: (decision: ReasonedDecision) => void;
  readonly isSubmitting?: boolean;
  /** A refusal from the platform, already in plain language. */
  readonly error?: string | null;
  /** Why this operator may not decide. Set it and the form is disabled with the reason shown. */
  readonly blockedReason?: string | null;
  readonly onCancel?: () => void;
}

/** Holds the analyst's draft and the two rules it has to satisfy before it can be sent. */
function useDraftDecision(props: ReasonedDecisionFormProps) {
  const [code, setCode] = useState('');
  const [wording, setWording] = useState('');
  const [attempted, setAttempted] = useState(false);

  const blocked = Boolean(props.blockedReason);
  const missingCode = code === '';
  const tooShort = wording.trim().length < MIN_WORDING_LENGTH;

  return {
    code,
    wording,
    attempted,
    blocked,
    missingCode,
    tooShort,
    disabled: blocked || Boolean(props.isSubmitting),
    setWording,
    chooseReason: (next: string) => {
      setCode(next);
      const preset = findReason(props.reasons, next);
      if (preset) setWording(preset.customerWording);
    },
    submit: () => {
      setAttempted(true);
      if (blocked || missingCode || tooShort) return;
      props.onSubmit({ code, wording: wording.trim() });
    },
  };
}

/** Reason code plus customer wording, both mandatory. */
/**
 * A coded reason and the wording that goes with it.
 *
 * The code is what reporting counts; the wording is what a person reads. Both are required
 * because neither substitutes for the other — a code alone explains nothing to the
 * customer, and free text alone cannot be aggregated.
 */
interface DecisionFieldsProps {
  readonly reasons: ReasonedDecisionFormProps['reasons'];
  readonly wordingLabel: string;
  readonly code: string;
  readonly wording: string;
  readonly disabled: boolean;
  readonly showMissingCode: boolean;
  readonly showTooShort: boolean;
  readonly onChooseReason: (next: string) => void;
  readonly onWording: (next: string) => void;
}

function DecisionFields({
  reasons,
  wordingLabel,
  code,
  wording,
  disabled,
  showMissingCode,
  showTooShort,
  onChooseReason,
  onWording,
}: DecisionFieldsProps) {
  return (
    <>
      <FormField label="Reason" required error={showMissingCode && NO_REASON}>
        <Select
          value={code}
          disabled={disabled}
          placeholder="Choose a reason"
          options={reasonOptions(reasons)}
          onChange={(event) => onChooseReason(event.target.value)}
        />
      </FormField>

      <FormField
        label={wordingLabel}
        required
        hint={WORDING_HINT}
        error={showTooShort && TOO_SHORT}
      >
        <Textarea
          rows={5}
          value={wording}
          disabled={disabled}
          onChange={(event) => onWording(event.target.value)}
        />
      </FormField>
    </>
  );
}

export function ReasonedDecisionForm(props: ReasonedDecisionFormProps) {
  const {
    attempted,
    blocked,
    chooseReason,
    code,
    disabled,
    missingCode,
    setWording,
    submit,
    tooShort,
    wording,
  } = useDraftDecision(props);

  return (
    <div className="flex flex-col gap-3">
      {props.blockedReason && <Alert tone="warning">{props.blockedReason}</Alert>}
      {props.error && <Alert tone="danger">{props.error}</Alert>}

      <DecisionFields
        reasons={props.reasons}
        wordingLabel={props.wordingLabel}
        code={code}
        wording={wording}
        disabled={disabled}
        showMissingCode={attempted && missingCode}
        showTooShort={attempted && tooShort}
        onChooseReason={chooseReason}
        onWording={setWording}
      />

      <Actions {...props} blocked={blocked} onSubmitClick={submit} />
    </div>
  );
}

interface ActionsProps extends ReasonedDecisionFormProps {
  readonly blocked: boolean;
  readonly onSubmitClick: () => void;
}

function Actions(props: ActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant={props.destructive ? 'danger' : 'primary'}
        disabled={props.blocked}
        loading={props.isSubmitting}
        onClick={props.onSubmitClick}
      >
        {props.submitLabel}
      </Button>
      {props.onCancel && (
        <Button variant="ghost" disabled={props.isSubmitting} onClick={props.onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
