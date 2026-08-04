/**
 * The lending decision.
 *
 * Three outcomes, and the difference between them matters to the applicant. Approving
 * sends an offer they can accept; referring keeps the application open for a second
 * underwriter; declining closes it, and the reasons are the ones the applicant is entitled
 * to be given. Declining with no reasons is refused here because it would be refused by
 * the regulator later.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { LoanApplication } from '@reliance/contracts';
import { Alert, Button, FormField, MoneyText, Select, Textarea } from '@reliance/ui';

import { opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatBasisPoints } from '@/lib/format';

import type { QuotedOffer } from './offer-builder';

/** The three answers an underwriter can give. */
type Outcome = 'APPROVE' | 'REFER' | 'DECLINE';

const OUTCOME_OPTIONS = [
  { value: 'APPROVE', label: 'Approve and make an offer' },
  { value: 'REFER', label: 'Refer to a second underwriter' },
  { value: 'DECLINE', label: 'Decline' },
];

/** Long enough to be a reason rather than a word. */
const MIN_NOTE_LENGTH = 12;

const NOTE_HINT = 'Recorded on the credit file and read back on any complaint.';

const DECLINE_HINT = 'One reason per line. These are the reasons the applicant is given.';

export interface DecisionFormProps {
  readonly application: LoanApplication;
  /** The offer the builder last quoted, used when approving. */
  readonly offer: QuotedOffer | null;
  readonly onDecided: () => void;
}

function OfferSummary({ offer }: Readonly<{ offer: QuotedOffer }>) {
  return (
    <Alert tone="info" title="The offer this would send">
      <span className="flex flex-wrap items-center gap-1">
        <MoneyText amount={offer.amount.amount} currency={offer.amount.currency} size="sm" muted />
        over {offer.termMonths} months at {formatBasisPoints(offer.aprBps)} APR.
      </span>
    </Alert>
  );
}

interface FieldsProps {
  readonly outcome: Outcome;
  readonly offer: QuotedOffer | null;
  readonly reasons: string;
  readonly onReasonsChange: (value: string) => void;
  readonly reasonsMissing: boolean;
}

function OutcomeFields(props: FieldsProps) {
  if (props.outcome === 'APPROVE') {
    return props.offer ? (
      <OfferSummary offer={props.offer} />
    ) : (
      <Alert tone="warning">
        Quote an offer above before approving, or the applicant is approved on the terms they asked
        for rather than the ones you intended.
      </Alert>
    );
  }

  if (props.outcome === 'REFER') {
    return (
      <Alert tone="info">
        The application stays open and moves to a second underwriter. The applicant is not told a
        decision has been made.
      </Alert>
    );
  }

  return (
    <FormField
      label="Reasons given to the applicant"
      required
      hint={DECLINE_HINT}
      error={props.reasonsMissing && 'Give at least one reason.'}
    >
      <Textarea
        rows={3}
        value={props.reasons}
        onChange={(event) => props.onReasonsChange(event.target.value)}
      />
    </FormField>
  );
}

/** Approve, refer or decline, with the record the decision needs. */
/** One reason per line, blanks discarded. */
function toReasonList(reasons: string): string[] {
  return reasons
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The decision as the platform expects it.
 *
 * The approved amount and rate travel only with an approval, and only when an offer was
 * actually quoted; the reasons travel only with a decline. Sending either on the wrong
 * outcome would record terms against a refusal.
 */
function toDecisionRequest(input: {
  outcome: Outcome;
  note: string;
  offer: QuotedOffer | null;
  declineReasons: readonly string[];
}) {
  const { outcome, note, offer, declineReasons } = input;

  return {
    decision: outcome,
    note: note.trim(),
    ...(outcome === 'APPROVE' && offer
      ? { aprBps: offer.aprBps, approvedAmount: offer.amount }
      : {}),
    ...(outcome === 'DECLINE' ? { reasons: [...declineReasons] } : {}),
  };
}

/**
 * The decision being recorded, and what it takes for it to be valid.
 *
 * A decline must carry reasons — they are what the customer is told, and an unexplained
 * decline is both unhelpful and, for regulated lending, not defensible. The note is
 * required either way: it is the underwriter's own record of why.
 */
function useDecision(
  application: LoanApplication,
  offer: QuotedOffer | null,
  onDecided: () => void,
) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome>('APPROVE');
  const [note, setNote] = useState('');
  const [reasons, setReasons] = useState('');
  const [attempted, setAttempted] = useState(false);

  const declineReasons = toReasonList(reasons);
  const noteTooShort = note.trim().length < MIN_NOTE_LENGTH;
  const reasonsMissing = outcome === 'DECLINE' && declineReasons.length === 0;

  const decide = useMutation({
    mutationFn: async () =>
      client.admin.decideLoan(
        application.id,
        toDecisionRequest({ outcome, note, offer, declineReasons }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('lending') });
      onDecided();
    },
  });

  const submit = (): void => {
    setAttempted(true);
    if (noteTooShort || reasonsMissing) return;
    decide.mutate();
  };

  return {
    fields: { outcome, note, reasons },
    setters: { setOutcome, setNote, setReasons },
    validation: { attempted, noteTooShort, reasonsMissing },
    decide,
    submit,
  };
}

/** The underwriter's own record of why. Required whichever way the decision goes. */
function NoteField({
  note,
  onNote,
  showError,
}: {
  readonly note: string;
  readonly onNote: (next: string) => void;
  readonly showError: boolean;
}) {
  return (
    <FormField
      label="Underwriting note"
      required
      hint={NOTE_HINT}
      error={showError && `Write at least ${MIN_NOTE_LENGTH} characters.`}
    >
      <Textarea rows={3} value={note} onChange={(event) => onNote(event.target.value)} />
    </FormField>
  );
}

export function DecisionForm({ application, offer, onDecided }: DecisionFormProps) {
  const { fields, setters, validation, decide, submit } = useDecision(
    application,
    offer,
    onDecided,
  );
  const { outcome, note, reasons } = fields;
  const { setOutcome, setNote, setReasons } = setters;
  const { attempted, noteTooShort, reasonsMissing } = validation;

  return (
    <div className="flex flex-col gap-4">
      {decide.error && <Alert tone="danger">{messageFor(decide.error)}</Alert>}

      <FormField label="Decision" required>
        <Select
          value={outcome}
          options={OUTCOME_OPTIONS}
          onChange={(event) => setOutcome(event.target.value as Outcome)}
        />
      </FormField>

      <OutcomeFields
        outcome={outcome}
        offer={offer}
        reasons={reasons}
        onReasonsChange={setReasons}
        reasonsMissing={attempted && reasonsMissing}
      />

      <NoteField note={note} onNote={setNote} showError={attempted && noteTooShort} />

      <div>
        <Button
          variant={outcome === 'DECLINE' ? 'danger' : 'primary'}
          loading={decide.isPending}
          onClick={submit}
        >
          Record the decision
        </Button>
      </div>
    </div>
  );
}
