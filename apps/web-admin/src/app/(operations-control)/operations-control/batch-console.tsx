/**
 * The batch console.
 *
 * On-demand runs of the bank's scheduled processing, plus the runbook sequences the desk
 * runs as a unit. Every run reports what it touched — processed, succeeded, failed — and
 * its log, because a batch that reports only "done" is a batch nobody can sign off.
 *
 * The rehearsal switch is the important control. It reports exactly what a run would do
 * and writes nothing, which is what an operator needs at four in the afternoon when they
 * are not yet sure the batch is safe to run.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { JobResult, SimJob } from '@reliance/contracts';
import { Alert, Badge, Button, Switch } from '@reliance/ui';

import { Panel } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatCount } from '@/lib/format';

import { BATCH_JOBS, BATCH_PRESETS, batchLabel, type BatchPreset } from './batch-jobs';

/** Milliseconds in a second, for a duration a person can read. */
const MS_PER_SECOND = 1000;

type Outcome = JobResult['data'];

function OutcomeCard({ outcome }: Readonly<{ outcome: Outcome }>) {
  const tone = outcome.failed > 0 ? 'warning' : 'success';

  return (
    <Alert tone={outcome.dryRun ? 'info' : tone} title={batchLabel(outcome.job)}>
      <p>
        {formatCount(outcome.processed)} processed · {formatCount(outcome.succeeded)} succeeded ·{' '}
        {formatCount(outcome.failed)} failed · {(outcome.durationMs / MS_PER_SECOND).toFixed(1)}s
        {outcome.dryRun ? ' · rehearsal, nothing written' : ''}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
        {outcome.log.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Alert>
  );
}

interface JobRowProps {
  readonly label: string;
  readonly effect: string;
  readonly isBusy: boolean;
  readonly onRun: () => void;
}

function JobRow({ label, effect, isBusy, onRun }: JobRowProps) {
  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5 last:border-0">
      <span className="flex min-w-0 flex-col">
        <span className="font-body text-fg text-sm font-medium">{label}</span>
        <span className="font-body text-fg-muted text-xs">{effect}</span>
      </span>
      <Button size="sm" variant="secondary" loading={isBusy} onClick={onRun}>
        Run now
      </Button>
    </li>
  );
}

function PresetCard({
  preset,
  onRun,
  isBusy,
}: Readonly<{ preset: BatchPreset; onRun: () => void; isBusy: boolean }>) {
  return (
    <li className="border-border flex flex-col gap-2 rounded-md border p-3">
      <span className="font-body text-fg text-sm font-medium">{preset.label}</span>
      <span className="font-body text-fg-muted text-xs">{preset.description}</span>
      <span className="flex flex-wrap gap-1">
        {preset.jobs.map((job, index) => (
          <Badge key={job} tone="neutral">
            {index + 1}. {batchLabel(job)}
          </Badge>
        ))}
      </span>
      <div>
        <Button size="sm" loading={isBusy} onClick={onRun}>
          Run the sequence
        </Button>
      </div>
    </li>
  );
}

/** Runs one batch, or a runbook sequence, and reports what happened. */
/**
 * Runs a sequence of processes, one after another.
 *
 * Sequential on purpose: a runbook is an order, and interest accrual that overtakes the
 * posting it accrues on produces a figure that never existed. A rehearsal invalidates
 * nothing, because nothing changed.
 */
function useBatchRun(rehearse: boolean) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [outcomes, setOutcomes] = useState<readonly Outcome[]>([]);

  const run = useMutation({
    mutationFn: async (jobs: readonly SimJob[]): Promise<readonly Outcome[]> => {
      const results: Outcome[] = [];
      for (const job of jobs) {
        const result = await client.simulation.runJob({ job, dryRun: rehearse });
        results.push(result.data);
      }
      return results;
    },
    onSuccess: (results) => {
      setOutcomes(results);
      if (!rehearse) queryClient.invalidateQueries();
    },
  });

  return { run, outcomes };
}

/** What the last run did, one card per process. Absent until something has been run. */
function OutcomeList({ outcomes }: { readonly outcomes: readonly Outcome[] }) {
  if (outcomes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {outcomes.map((outcome) => (
        <OutcomeCard key={outcome.job} outcome={outcome} />
      ))}
    </div>
  );
}

/** A titled group of runnable things. */
function BatchSection({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-body text-fg-subtle text-xs font-semibold tracking-wider uppercase">
        {heading}
      </h3>
      {children}
    </section>
  );
}

/** What a section of the console needs: whether a run is in flight, and how to start one. */
interface RunnableProps {
  readonly busy: boolean;
  readonly onRun: (jobs: readonly SimJob[]) => void;
}

/** Whole runbooks: a named order of processes, run end to end. */
function PresetSection({ busy, onRun }: RunnableProps) {
  return (
    <BatchSection heading="Runbook sequences">
      <ul className="grid gap-3 md:grid-cols-3">
        {BATCH_PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isBusy={busy}
            onRun={() => onRun(preset.jobs)}
          />
        ))}
      </ul>
    </BatchSection>
  );
}

/** One process at a time, for when a runbook is more than the situation needs. */
function JobSection({ busy, onRun }: RunnableProps) {
  return (
    <BatchSection heading="Individual processes">
      <ul className="border-border flex flex-col rounded-md border">
        {BATCH_JOBS.map((batch) => (
          <JobRow
            key={batch.job}
            label={batch.label}
            effect={batch.effect}
            isBusy={busy}
            onRun={() => onRun([batch.job])}
          />
        ))}
      </ul>
    </BatchSection>
  );
}

export function BatchConsole() {
  const [rehearse, setRehearse] = useState(false);
  const { run, outcomes } = useBatchRun(rehearse);

  return (
    <Panel
      title="Batch processing"
      description="Run the bank's scheduled processing on demand, singly or as a runbook sequence."
      action={
        <Switch checked={rehearse} onChange={(event) => setRehearse(event.target.checked)}>
          Rehearse only
        </Switch>
      }
    >
      <div className="flex flex-col gap-4">
        {run.error && <Alert tone="danger">{messageFor(run.error)}</Alert>}

        <OutcomeList outcomes={outcomes} />

        <PresetSection busy={run.isPending} onRun={(jobs) => run.mutate(jobs)} />
        <JobSection busy={run.isPending} onRun={(jobs) => run.mutate(jobs)} />
      </div>
    </Panel>
  );
}
