/**
 * What a threshold change would have done.
 *
 * The headline number is the one the whole panel exists for: how many alerts this rule
 * would have raised over the window. A team clearing forty alerts a day can absorb a
 * change that raises fifty; the same change producing six hundred is a decision to stop
 * doing something else, and nobody discovers that by reasoning about a threshold.
 *
 * The overlap with alerts that actually fired is shown next to it, because a rule that
 * raises three hundred alerts of which two hundred and ninety are ones the bank already
 * had is not finding anything new — it is duplicating work.
 */

'use client';

import { useState } from 'react';

import { Button, EmptyState, FormField, Select, Skeleton } from '@reliance/ui';

import { MetricRow, MetricTile, QueueError } from '@/components/compliance/kit';
import { formatBasisPoints, formatCount, formatInstant } from '@/lib/format';

import { useRuleBacktest } from '../data/use-aml';

/** Windows worth replaying. Shorter than a month hides weekly and monthly patterns. */
const WINDOW_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 12 months' },
];

const DEFAULT_WINDOW = '90';

/** What the platform answered when the rule was replayed. */
type BacktestResult = NonNullable<ReturnType<typeof useRuleBacktest>['data']>;

function Results({ result }: Readonly<{ result: BacktestResult }>) {
  return (
    <div className="flex flex-col gap-3">
      <MetricRow>
        <MetricTile
          label="Would have alerted"
          value={formatCount(result.wouldHaveAlerted)}
          detail={`Over ${result.windowDays} days`}
        />
        <MetricTile label="Postings evaluated" value={formatCount(result.transactionsEvaluated)} />
        <MetricTile
          label="Already caught"
          value={formatCount(result.matchedExistingAlerts)}
          detail="Overlap with alerts that really fired"
        />
        <MetricTile
          label="Estimated false positives"
          value={formatBasisPoints(result.estimatedFalsePositiveRateBps)}
        />
      </MetricRow>

      <p className="font-body text-fg-muted text-xs">
        Replayed {formatInstant(result.ranAt)}. Sample postings:{' '}
        <span className="font-mono">
          {result.sampleTransactionIds.join(', ') || 'none in this window'}
        </span>
      </p>
    </div>
  );
}

function NothingSelected() {
  return (
    <EmptyState
      title="Choose a rule to replay"
      description="Select a rule to see how many alerts its current thresholds would have raised."
    />
  );
}

export interface RuleBacktestProps {
  /** The rule to replay, or `null` when none is selected. */
  readonly ruleId: string | null;
}

/** Replays a rule over history and reports what it would have caught. */
export function RuleBacktest({ ruleId }: RuleBacktestProps) {
  const [windowDays, setWindowDays] = useState(DEFAULT_WINDOW);
  const [running, setRunning] = useState<string | null>(null);

  const backtest = useRuleBacktest(running, Number(windowDays));

  if (!ruleId) return <NothingSelected />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label="Window" className="min-w-52">
          <Select
            value={windowDays}
            options={WINDOW_OPTIONS}
            onChange={(event) => setWindowDays(event.target.value)}
          />
        </FormField>
        <Button loading={backtest.isFetching} onClick={() => setRunning(ruleId)}>
          Replay over history
        </Button>
        <p className="font-body text-fg-muted text-xs">
          A replay reads history and changes nothing. No alert is raised and no customer is
          affected.
        </p>
      </div>

      {backtest.isFetching && <Skeleton className="h-24 w-full" />}

      {backtest.isError && (
        <QueueError
          error={backtest.error}
          subject="the replay"
          onRetry={() => backtest.refetch()}
        />
      )}

      {backtest.data && !backtest.isFetching && <Results result={backtest.data} />}
    </div>
  );
}
