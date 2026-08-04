/**
 * The affordability assessment.
 *
 * Run explicitly rather than on opening the application, and that is deliberate: an
 * assessment is a real check against the applicant's file, it is recorded, and running one
 * every time an underwriter glances at a queue item would make the record meaningless.
 *
 * The score and the debt-to-income ratio are shown with the reasons the assessment gave.
 * A number with no reasons is not an assessment an underwriter can defend.
 */

'use client';

import { useMutation } from '@tanstack/react-query';

import type { LoanApplication, LoanEligibility } from '@reliance/contracts';
import { Alert, Button, MoneyText } from '@reliance/ui';

import { KpiTile } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatBasisPoints } from '@/lib/format';

/** Credit score at or above which the applicant is in the bank's prime band. */
const PRIME_FROM = 700;

/** Debt-to-income, in basis points, at or above which affordability is strained. */
const STRAINED_FROM_BPS = 4000;

const OVER_THRESHOLD = "Above the bank's comfort threshold of 40%.";
const UNDER_THRESHOLD = "Within the bank's comfort threshold of 40%.";

function scoreTone(score: number): 'success' | 'warning' {
  return score >= PRIME_FROM ? 'success' : 'warning';
}

function affordabilityTone(bps: number): 'success' | 'danger' {
  return bps >= STRAINED_FROM_BPS ? 'danger' : 'success';
}

function Figures({ assessment }: Readonly<{ assessment: LoanEligibility }>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label="Credit score"
        tone={scoreTone(assessment.creditScore)}
        value={String(assessment.creditScore)}
        hint={
          assessment.creditScore >= PRIME_FROM ? 'Within the prime band.' : 'Below the prime band.'
        }
      />
      <KpiTile
        label="Debt to income"
        tone={affordabilityTone(assessment.debtToIncomeBps)}
        value={formatBasisPoints(assessment.debtToIncomeBps)}
        hint={assessment.debtToIncomeBps >= STRAINED_FROM_BPS ? OVER_THRESHOLD : UNDER_THRESHOLD}
      />
      <OfferCeilingTiles assessment={assessment} />
    </div>
  );
}

/** What the assessment concluded the bank would actually offer. */
function OfferCeilingTiles({ assessment }: Readonly<{ assessment: LoanEligibility }>) {
  return (
    <>
      <KpiTile
        label="Maximum we would lend"
        value={
          <MoneyText
            amount={assessment.maxAmount.amount}
            currency={assessment.maxAmount.currency}
            size="xl"
            muted
          />
        }
        hint="On this product, at this term."
      />
      <KpiTile
        label="Indicative rate"
        value={
          assessment.indicativeAprBps === null
            ? '—'
            : formatBasisPoints(assessment.indicativeAprBps)
        }
        hint="Before any manual adjustment on the offer."
      />
    </>
  );
}

export interface AssessmentPanelProps {
  readonly application: LoanApplication;
}

/** The figures, plus whatever the assessment wanted to say in words. */
function AssessmentResult({ assessment }: Readonly<{ assessment: LoanEligibility }>) {
  return (
    <>
      <Figures assessment={assessment} />
      {assessment.reasons.length > 0 && (
        <Alert tone={assessment.eligible ? 'info' : 'warning'} title="What the assessment found">
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
            {assessment.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Alert>
      )}
    </>
  );
}

/** Runs and shows the affordability assessment for one application. */
export function AssessmentPanel({ application }: AssessmentPanelProps) {
  const client = useApiClient();

  const assess = useMutation({
    mutationFn: async () =>
      (
        await client.borrow.eligibility({
          productCode: application.productCode,
          amount: application.requestedAmount,
          termMonths: application.termMonths,
        })
      ).data,
  });

  return (
    <div className="flex flex-col gap-3">
      {assess.error && <Alert tone="danger">{messageFor(assess.error)}</Alert>}

      {assess.data ? (
        <AssessmentResult assessment={assess.data} />
      ) : (
        <Alert tone="neutral" title="No assessment on this application yet">
          Running one checks the applicant&apos;s file and records the result against the
          application.
        </Alert>
      )}

      <div>
        <Button variant="secondary" loading={assess.isPending} onClick={() => assess.mutate()}>
          {assess.data ? 'Run the assessment again' : 'Run the affordability assessment'}
        </Button>
      </div>
    </div>
  );
}
