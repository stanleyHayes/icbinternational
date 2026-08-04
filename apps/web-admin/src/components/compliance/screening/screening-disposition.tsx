/**
 * Closing a hit, one of three ways.
 *
 * Discounting a match is the decision that gets audited hardest, because it is the one
 * that lets a customer through. So the false-positive path takes the same reason code and
 * the same written justification as a confirmation does — an analyst who cannot say which
 * identifier ruled the listed person out has not ruled them out.
 *
 * Escalation is offered as a first-class outcome rather than being reached by not
 * deciding. A hit left open because nobody was sure looks identical to one nobody has got
 * to, and only one of those needs a senior analyst.
 */

'use client';

import { useState } from 'react';

import type { ScreeningHit } from '@reliance/api-client';
import { Alert, Button } from '@reliance/ui';

import {
  failureMessage,
  ReasonedDecisionForm,
  SCREENING_DISPOSITION_REASONS,
} from '@/components/compliance/kit';

import { useDecideScreeningHit } from '../data/use-screening';

type Disposition = 'TRUE_MATCH' | 'FALSE_POSITIVE' | 'ESCALATED';

const SUBMIT_LABEL: Record<Disposition, string> = {
  TRUE_MATCH: 'Confirm this is our customer',
  FALSE_POSITIVE: 'Discount this match',
  ESCALATED: 'Escalate for a senior decision',
};

const WORDING_LABEL: Record<Disposition, string> = {
  TRUE_MATCH: 'What identifiers confirm the match',
  FALSE_POSITIVE: 'What rules the listed person out',
  ESCALATED: 'What you need a second opinion on',
};

function DispositionPicker({ onChoose }: Readonly<{ onChoose: (choice: Disposition) => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="danger" onClick={() => onChoose('TRUE_MATCH')}>
        It is our customer
      </Button>
      <Button variant="secondary" onClick={() => onChoose('ESCALATED')}>
        Escalate
      </Button>
      <Button onClick={() => onChoose('FALSE_POSITIVE')}>Discount the match</Button>
    </div>
  );
}

export interface ScreeningDispositionProps {
  readonly hit: ScreeningHit;
  readonly onDecided: () => void;
}

/** The three outcomes for a screening hit. */
export function ScreeningDisposition({ hit, onDecided }: ScreeningDispositionProps) {
  const [choice, setChoice] = useState<Disposition | null>(null);
  const decide = useDecideScreeningHit();

  if (hit.status !== 'OPEN' && choice === null) {
    return (
      <Alert tone="info" title="Already decided">
        This hit was closed on {hit.decidedAt ?? 'an earlier date'}. Reopen it from the queue if new
        information has come in.
      </Alert>
    );
  }

  if (choice === null) return <DispositionPicker onChoose={setChoice} />;

  return (
    <ReasonedDecisionForm
      submitLabel={SUBMIT_LABEL[choice]}
      destructive={choice === 'TRUE_MATCH'}
      reasons={SCREENING_DISPOSITION_REASONS}
      wordingLabel={WORDING_LABEL[choice]}
      isSubmitting={decide.isPending}
      error={decide.isError ? failureMessage(decide.error) : null}
      onCancel={() => setChoice(null)}
      onSubmit={(decision) =>
        decide.mutate(
          {
            hitId: hit.id,
            status: choice,
            note: `${decision.code}: ${decision.wording}`,
          },
          {
            onSuccess: () => {
              setChoice(null);
              onDecided();
            },
          },
        )
      }
    />
  );
}
