/**
 * Deciding several identity cases at once, safely.
 *
 * Bulk approval is not offered and will not be. Approving an identity case is a statement
 * that a person looked at a document, and a control that lets forty of those be made in
 * one click makes that statement false. What is offered in bulk is the two outcomes that
 * do not assert anyone looked: sending cases back for the same missing evidence, and
 * refusing cases for the same objective reason.
 *
 * The count is in the button's label rather than beside it, so the number is unmissable
 * at the moment of committing rather than at the moment of selecting.
 */

'use client';

import { useState } from 'react';

import type { KycCase } from '@reliance/contracts';
import { Alert, Button, Dialog } from '@reliance/ui';

import {
  failureMessage,
  KYC_MORE_INFO_REASONS,
  KYC_REJECTION_REASONS,
  ReasonedDecisionForm,
} from '@/components/compliance/kit';

import { useBulkKycDecision } from '../data/use-kyc';

type BulkOutcome = 'REJECT' | 'REQUEST_MORE_INFO';

const SAME_WORDING = 'The same reason and the same wording go to every customer in this selection.';

export interface KycBulkBarProps {
  readonly selected: readonly KycCase[];
  readonly onClear: () => void;
  readonly onApplied: () => void;
}

function outcomeTitle(outcome: BulkOutcome, count: number): string {
  const cases = `${count} case${count === 1 ? '' : 's'}`;
  return outcome === 'REJECT' ? `Refuse ${cases}` : `Send ${cases} back to the customer`;
}

/** The chosen outcome and the run that applies it to every selected case. */
function useBulkRun({ selected, onClear, onApplied }: KycBulkBarProps) {
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const bulk = useBulkKycDecision();

  return {
    outcome,
    setOutcome,
    bulk,
    apply: (reviewerMessage: string) => {
      if (!outcome) return;
      bulk.mutate(
        selected.map((record) => ({ caseId: record.id, decision: outcome, reviewerMessage })),
        {
          onSuccess: () => {
            setOutcome(null);
            onClear();
            onApplied();
          },
        },
      );
    },
  };
}

/** The bar that appears once cases are selected. */
export function KycBulkBar(props: KycBulkBarProps) {
  const { selected, onClear } = props;
  const { apply, bulk, outcome, setOutcome } = useBulkRun(props);

  if (selected.length === 0) return null;

  return (
    <>
      <SelectionBar count={selected.length} onChoose={setOutcome} onClear={onClear} />

      <Dialog
        open={outcome !== null}
        onClose={() => setOutcome(null)}
        title={outcome ? outcomeTitle(outcome, selected.length) : ''}
        description={SAME_WORDING}
        size="lg"
      >
        {bulk.isError && (
          <Alert tone="danger" title="The run stopped part-way">
            {failureMessage(bulk.error)} Cases decided before the failure have been saved; reload
            the queue to see which remain.
          </Alert>
        )}

        {outcome && (
          <BulkForm
            outcome={outcome}
            count={selected.length}
            isSubmitting={bulk.isPending}
            onCancel={() => setOutcome(null)}
            onSubmit={apply}
          />
        )}
      </Dialog>
    </>
  );
}

interface BulkFormProps {
  readonly outcome: BulkOutcome;
  readonly count: number;
  readonly isSubmitting: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (reviewerMessage: string) => void;
}

function BulkForm({ outcome, count, isSubmitting, onCancel, onSubmit }: BulkFormProps) {
  const refusing = outcome === 'REJECT';

  return (
    <ReasonedDecisionForm
      submitLabel={outcomeTitle(outcome, count)}
      destructive={refusing}
      reasons={refusing ? KYC_REJECTION_REASONS : KYC_MORE_INFO_REASONS}
      wordingLabel="What every customer in this selection will be told"
      isSubmitting={isSubmitting}
      onCancel={onCancel}
      onSubmit={(decision) => onSubmit(`${decision.code}: ${decision.wording}`)}
    />
  );
}

interface SelectionBarProps {
  readonly count: number;
  readonly onChoose: (outcome: BulkOutcome) => void;
  readonly onClear: () => void;
}

function SelectionBar({ count, onChoose, onClear }: SelectionBarProps) {
  return (
    <div className="border-accent bg-accent-soft flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
      <span className="font-body text-fg text-sm font-medium">
        {count} case{count === 1 ? '' : 's'} selected
      </span>
      <Button size="sm" variant="secondary" onClick={() => onChoose('REQUEST_MORE_INFO')}>
        Ask all for more
      </Button>
      <Button size="sm" variant="danger" onClick={() => onChoose('REJECT')}>
        Refuse all
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
