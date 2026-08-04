/**
 * Deciding a dispute.
 *
 * Three outcomes, and one of them moves money. Losing a dispute where provisional credit
 * was given means taking that credit back out of the customer's account, so the reversal
 * is an explicit switch with the amount written next to it rather than something implied
 * by the outcome. An analyst has to look at the figure they are about to remove.
 *
 * The summary is what the customer receives, and it is required for every outcome
 * including the ones in their favour. "Your dispute was successful" with no explanation
 * still generates a phone call.
 */

'use client';

import { useState } from 'react';

import { Permission, type Dispute } from '@reliance/contracts';
import { Alert, Button, FormField, MoneyText, Switch, Textarea } from '@reliance/ui';

import { failureMessage } from '@/components/compliance/kit';
import { usePermissions } from '@/lib/permissions';

import { useDecideDispute } from './use-disputes';

type Outcome = 'WON' | 'LOST' | 'WITHDRAWN';

/** Long enough to be an explanation rather than a verdict. */
const MIN_SUMMARY_LENGTH = 30;

const TOO_SHORT = `Write at least ${MIN_SUMMARY_LENGTH} characters. The customer reads this.`;

const CANNOT_DECIDE = 'Your role lets you read disputes but not decide them.';

const OUTCOME_LABEL: Record<Outcome, string> = {
  WON: 'Find for the customer',
  LOST: 'Find against the customer',
  WITHDRAWN: 'Record it as withdrawn',
};

const OUTCOME_HINT: Record<Outcome, string> = {
  WON: 'The disputed amount stays with the customer and any provisional credit becomes permanent.',
  LOST: 'The claim fails. If provisional credit was given, decide below whether to take it back.',
  WITHDRAWN: 'The customer no longer wishes to pursue the claim.',
};

const SUMMARY_HINT = 'Sent word for word, and kept with the decision.';

function OutcomePicker({ onChoose }: Readonly<{ onChoose: (outcome: Outcome) => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => onChoose('WON')}>{OUTCOME_LABEL.WON}</Button>
      <Button variant="danger" onClick={() => onChoose('LOST')}>
        {OUTCOME_LABEL.LOST}
      </Button>
      <Button variant="secondary" onClick={() => onChoose('WITHDRAWN')}>
        {OUTCOME_LABEL.WITHDRAWN}
      </Button>
    </div>
  );
}

interface ReversalSwitchProps {
  readonly credit: NonNullable<Dispute['provisionalCredit']>;
  readonly reverse: boolean;
  readonly disabled: boolean;
  readonly onChange: (reverse: boolean) => void;
}

function ReversalSwitch({ credit, reverse, disabled, onChange }: ReversalSwitchProps) {
  return (
    <Switch
      checked={reverse}
      disabled={disabled}
      description="Leaving this off writes the credit off as a loss to the bank."
      onChange={(event) => onChange(event.target.checked)}
    >
      <span className="flex flex-wrap items-center gap-1">
        Take back the provisional credit of
        <MoneyText amount={credit.amount} currency={credit.currency} />
      </span>
    </Switch>
  );
}

export interface DisputeOutcomeProps {
  readonly dispute: Dispute;
}

/** The chosen outcome, the wording, and the decision behind the confirm button. */
function useOutcomeForm(dispute: Dispute) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [summary, setSummary] = useState('');
  const [reverse, setReverse] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const decide = useDecideDispute();

  const tooShort = summary.trim().length < MIN_SUMMARY_LENGTH;
  const showsReversal = outcome === 'LOST' && dispute.provisionalCredit !== null;

  return {
    outcome,
    setOutcome,
    summary,
    setSummary,
    reverse,
    setReverse,
    attempted,
    decide,
    tooShort,
    showsReversal,
    submit: () => {
      setAttempted(true);
      if (!outcome || tooShort) return;
      decide.mutate({
        disputeId: dispute.id,
        outcome,
        outcomeSummary: summary.trim(),
        reverseProvisionalCredit: showsReversal ? reverse : undefined,
      });
    },
  };
}

interface OutcomeFormProps {
  readonly dispute: Dispute;
  readonly form: ReturnType<typeof useOutcomeForm>;
  readonly outcome: Outcome;
}

function OutcomeForm({ dispute, form, outcome }: OutcomeFormProps) {
  const busy = form.decide.isPending;

  return (
    <div className="flex flex-col gap-3">
      <Alert tone={outcome === 'LOST' ? 'warning' : 'info'} title={OUTCOME_LABEL[outcome]}>
        {OUTCOME_HINT[outcome]}
      </Alert>

      {form.decide.isError && <Alert tone="danger">{failureMessage(form.decide.error)}</Alert>}

      {form.showsReversal && dispute.provisionalCredit && (
        <ReversalSwitch
          credit={dispute.provisionalCredit}
          reverse={form.reverse}
          disabled={busy}
          onChange={form.setReverse}
        />
      )}

      <SummaryField form={form} busy={busy} />

      <div className="flex items-center gap-2">
        <Button
          variant={outcome === 'LOST' ? 'danger' : 'primary'}
          loading={busy}
          onClick={form.submit}
        >
          {OUTCOME_LABEL[outcome]}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => form.setOutcome(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface SummaryFieldProps {
  readonly form: ReturnType<typeof useOutcomeForm>;
  readonly busy: boolean;
}

function SummaryField({ form, busy }: SummaryFieldProps) {
  return (
    <FormField
      label="What the customer will be told"
      required
      hint={SUMMARY_HINT}
      error={form.attempted && form.tooShort && TOO_SHORT}
    >
      <Textarea
        rows={4}
        value={form.summary}
        disabled={busy}
        onChange={(event) => form.setSummary(event.target.value)}
      />
    </FormField>
  );
}

function AlreadyDecided({ resolvedAt }: Readonly<{ resolvedAt: string }>) {
  return (
    <Alert tone="info" title="Already decided">
      This dispute was resolved on {resolvedAt}. Its outcome and the reason given to the customer
      are in the timeline.
    </Alert>
  );
}

/** The outcome controls for one dispute. */
export function DisputeOutcome({ dispute }: DisputeOutcomeProps) {
  const permissions = usePermissions();
  const form = useOutcomeForm(dispute);

  if (!permissions.has(Permission.DISPUTE_MANAGE)) {
    return <Alert tone="warning">{CANNOT_DECIDE}</Alert>;
  }
  if (dispute.resolvedAt) return <AlreadyDecided resolvedAt={dispute.resolvedAt} />;
  if (form.outcome === null) return <OutcomePicker onChoose={form.setOutcome} />;

  return <OutcomeForm dispute={dispute} form={form} outcome={form.outcome} />;
}
