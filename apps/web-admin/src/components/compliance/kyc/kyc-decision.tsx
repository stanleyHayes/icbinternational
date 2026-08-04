/**
 * Approve, refuse, or ask for more.
 *
 * Three outcomes, three shapes of evidence. An approval needs a tier and a risk rating,
 * because the tier is what the limits engine reads and the rating is what the next review
 * cycle is scheduled from — approving without either leaves the customer verified to
 * nothing in particular. A refusal and a request for more both need a reason code and the
 * exact words the customer will receive.
 *
 * The outcome is chosen first and the form changes with it, rather than every field being
 * on screen at once. An analyst filling in a refusal reason and then clicking Approve is a
 * real failure mode, and the cure is that the two are never simultaneously available.
 */

'use client';

import { useState } from 'react';

import { RiskRating, type KycCase } from '@reliance/contracts';
import { Alert, Button, FormField, Select } from '@reliance/ui';

import {
  failureMessage,
  KYC_MORE_INFO_REASONS,
  KYC_REJECTION_REASONS,
  KYC_TIER_OPTIONS,
  ReasonedDecisionForm,
} from '@/components/compliance/kit';
import { humaniseCode } from '@/lib/format';

import { useDecideKyc, type KycDecisionInput } from '../data/use-kyc';

/** Which of the three outcomes the analyst is composing. */
type Outcome = 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFO' | null;

const RISK_OPTIONS = Object.values(RiskRating).map((rating) => ({
  value: rating,
  label: `${humaniseCode(rating)} risk`,
}));

const RATING_HINT = 'Sets how often this customer is reviewed again.';

export interface KycDecisionProps {
  readonly record: KycCase;
  /** How many of the analyst's own checks are still unticked. */
  readonly outstandingChecks: number;
  /** Set when this operator may read the case but not decide it. */
  readonly blockedReason?: string | null;
  readonly onDecided: () => void;
}

interface ApproveFormProps {
  readonly record: KycCase;
  readonly outstandingChecks: number;
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly onApprove: (tier: number, rating: RiskRating) => void;
}

function ApproveForm(props: ApproveFormProps) {
  const [tier, setTier] = useState(String(props.record.requestedTier));
  const [rating, setRating] = useState<string>(RiskRating.LOW);

  return (
    <div className="flex flex-col gap-3">
      {props.outstandingChecks > 0 && (
        <Alert tone="warning">
          {props.outstandingChecks} of your checks are still unticked. Approving now records that
          you were satisfied without completing them.
        </Alert>
      )}
      {props.error && <Alert tone="danger">{props.error}</Alert>}

      <FormField label="Tier to grant" required hint="This is what the limits engine reads.">
        <Select value={tier} options={KYC_TIER_OPTIONS} onChange={(e) => setTier(e.target.value)} />
      </FormField>

      <FormField label="Customer risk rating" required hint={RATING_HINT}>
        <Select value={rating} options={RISK_OPTIONS} onChange={(e) => setRating(e.target.value)} />
      </FormField>

      <div>
        <Button
          loading={props.isSubmitting}
          onClick={() => props.onApprove(Number(tier), rating as RiskRating)}
        >
          Approve and grant tier {tier}
        </Button>
      </div>
    </div>
  );
}

function OutcomePicker({ onChoose }: Readonly<{ onChoose: (outcome: Outcome) => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => onChoose('APPROVE')}>Approve</Button>
      <Button variant="secondary" onClick={() => onChoose('REQUEST_MORE_INFO')}>
        Ask for more
      </Button>
      <Button variant="danger" onClick={() => onChoose('REJECT')}>
        Refuse
      </Button>
    </div>
  );
}

interface RefusalFormProps {
  readonly refusing: boolean;
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onSend: (reviewerMessage: string) => void;
}

function RefusalForm(props: RefusalFormProps) {
  const { refusing } = props;

  return (
    <ReasonedDecisionForm
      submitLabel={refusing ? 'Refuse the application' : 'Send it back to the customer'}
      destructive={refusing}
      reasons={refusing ? KYC_REJECTION_REASONS : KYC_MORE_INFO_REASONS}
      wordingLabel="What the customer will be told"
      isSubmitting={props.isSubmitting}
      error={props.error}
      onCancel={props.onCancel}
      onSubmit={(decision) => props.onSend(`${decision.code}: ${decision.wording}`)}
    />
  );
}

/** The decision controls for one identity case. */
export function KycDecision(props: KycDecisionProps) {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const decide = useDecideKyc();
  const error = decide.isError ? failureMessage(decide.error) : null;

  const send = (input: Omit<KycDecisionInput, 'caseId'>): void => {
    const settled = () => {
      setOutcome(null);
      props.onDecided();
    };
    decide.mutate({ ...input, caseId: props.record.id }, { onSuccess: settled });
  };

  if (props.blockedReason) return <Alert tone="warning">{props.blockedReason}</Alert>;
  if (outcome === null) return <OutcomePicker onChoose={setOutcome} />;

  if (outcome === 'APPROVE') {
    return (
      <ApproveForm
        record={props.record}
        outstandingChecks={props.outstandingChecks}
        isSubmitting={decide.isPending}
        error={error}
        onApprove={(grantedTier, riskRating) =>
          send({ decision: 'APPROVE', grantedTier, riskRating })
        }
      />
    );
  }

  const refusing = outcome === 'REJECT';

  return (
    <RefusalForm
      refusing={refusing}
      isSubmitting={decide.isPending}
      error={error}
      onCancel={() => setOutcome(null)}
      onSend={(reviewerMessage) =>
        send({ decision: refusing ? 'REJECT' : 'REQUEST_MORE_INFO', reviewerMessage })
      }
    />
  );
}
