/**
 * The job monitor.
 *
 * Background jobs are where a bank's failures hide: a statement run that died at two in
 * the morning leaves no customer-visible trace until somebody asks where their statement
 * is. The dead-letter count is therefore the headline, and replay is on the row rather
 * than behind a detail view — the operator's next action after seeing a failure is almost
 * always to run it again.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { JobRun } from '@reliance/api-client';
import { Permission } from '@reliance/contracts';
import { Button, StatusPill } from '@reliance/ui';

import { KpiTile, OpsScreen, RegisterPanel, opsKeys, toneForJob } from '@/components/ops';
import { FilterBar, type DataColumn, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount, formatInstant, humaniseCode, shortenId } from '@/lib/format';
import { useIsAllowed } from '@/lib/permissions';

/** Runs read per page. */
const PAGE_SIZE = 100;

/** Milliseconds in a second, for rendering a duration a person can read. */
const MS_PER_SECOND = 1000;

/** Statuses a replay is worth offering on. */
const REPLAYABLE: ReadonlySet<JobRun['status']> = new Set(['FAILED', 'DEAD']);

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'Outcome',
    kind: 'select',
    options: (['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'DEAD'] as const).map(
      (value) => ({ value, label: humaniseCode(value) }),
    ),
  },
  { id: 'queue', label: 'Queue', kind: 'text', placeholder: 'Queue name' },
];

function duration(run: JobRun): string {
  if (run.durationMs === null) return '—';
  return `${(run.durationMs / MS_PER_SECOND).toFixed(1)}s`;
}

interface ColumnOptions {
  readonly onReplay: (run: JobRun) => void;
  readonly canReplay: boolean;
  readonly replayingId: string | null;
}

/** What ran, how it went, and when. */
const RUN_COLUMNS: readonly DataColumn<JobRun>[] = [
  {
    id: 'name',
    header: 'Job',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium">{row.name}</span>
        <span className="text-fg-muted text-xs">{row.queue}</span>
      </span>
    ),
    csv: (row) => `${row.name} (${row.queue})`,
    sortValue: (row) => row.name,
  },
  {
    id: 'status',
    header: 'Outcome',
    alwaysVisible: true,
    cell: (row) => <StatusPill tone={toneForJob(row.status)} label={humaniseCode(row.status)} />,
    csv: (row) => row.status,
    sortValue: (row) => row.status,
  },
  {
    id: 'attempts',
    header: 'Attempts',
    align: 'end',
    cell: (row) => `${row.attempts} of ${row.maxAttempts}`,
    csv: (row) => `${String(row.attempts)}/${String(row.maxAttempts)}`,
    sortValue: (row) => row.attempts,
  },
  {
    id: 'duration',
    header: 'Took',
    align: 'end',
    cell: (row) => duration(row),
    csv: (row) => (row.durationMs === null ? '' : String(row.durationMs)),
    sortValue: (row) => row.durationMs ?? 0,
  },
  {
    id: 'failureReason',
    header: 'Why it failed',
    alwaysVisible: true,
    cell: (row) => row.failureReason ?? '—',
    csv: (row) => row.failureReason ?? '',
  },
  {
    id: 'scheduledAt',
    header: 'Scheduled (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.scheduledAt)}</span>,
    csv: (row) => row.scheduledAt,
    sortValue: (row) => row.scheduledAt,
  },
  {
    id: 'finishedAt',
    header: 'Finished (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.finishedAt)}</span>,
    csv: (row) => row.finishedAt ?? '',
  },
  {
    id: 'traceId',
    header: 'Trace',
    cell: (row) => (row.traceId ? shortenId(row.traceId) : '—'),
    csv: (row) => row.traceId ?? '',
  },
];

function columns(options: ColumnOptions): readonly DataColumn<JobRun>[] {
  return [
    ...RUN_COLUMNS,
    {
      id: 'replay',
      header: 'Replay',
      alwaysVisible: true,
      cell: (row) =>
        options.canReplay && REPLAYABLE.has(row.status) ? (
          <Button
            size="sm"
            variant="secondary"
            loading={options.replayingId === row.id}
            onClick={() => options.onReplay(row)}
          >
            Run it again
          </Button>
        ) : null,
      csv: (row) => (REPLAYABLE.has(row.status) ? 'replayable' : ''),
    },
  ];
}

function Figures({ runs }: Readonly<{ runs: readonly JobRun[] }>) {
  const dead = runs.filter((run) => run.status === 'DEAD').length;
  const failed = runs.filter((run) => run.status === 'FAILED').length;
  const running = runs.filter((run) => run.status === 'RUNNING').length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiTile
        label="In the dead-letter queue"
        tone={dead > 0 ? 'danger' : 'success'}
        value={formatCount(dead)}
        hint="Exhausted every retry. Nothing will happen to these unless somebody replays them."
      />
      <KpiTile
        label="Failed on this page"
        tone={failed > 0 ? 'warning' : 'success'}
        value={formatCount(failed)}
        hint="Failed at least once and may still retry on their own."
      />
      <KpiTile
        label="Running now"
        value={formatCount(running)}
        hint="Currently executing on a worker."
      />
    </div>
  );
}

/** Background job runs, with replay. */
/** Matches a run against the screen's filters. Both are optional and both narrow. */
function matchesFilters(run: JobRun, filters: Readonly<Record<string, string>>): boolean {
  const byStatus = !filters.status || run.status === filters.status;
  const byQueue =
    !filters.queue || run.queue.toLowerCase().includes(filters.queue.trim().toLowerCase());
  return byStatus && byQueue;
}

/** The run history and the replay that puts a failed one back on its queue. */
function useJobRuns() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: opsKeys.jobs(),
    queryFn: async ({ signal }) => client.admin.jobs({ limit: PAGE_SIZE }, { signal }),
  });

  const replay = useMutation({
    mutationFn: async (run: JobRun) => client.admin.replayJob(run.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: opsKeys.all('platform') }),
  });

  return { query, replay };
}

export function JobsScreen() {
  const canReplay = useIsAllowed(Permission.JOB_MANAGE);
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const { query, replay } = useJobRuns();

  const rows = (query.data?.data ?? []).filter((run) => matchesFilters(run, filters));

  return (
    <OpsScreen
      title="Job monitor"
      description="Every background run the platform has scheduled, what it did, and what to do about the ones that failed."
    >
      <Figures runs={rows} />

      <RegisterPanel
        title="Runs"
        description="Newest first."
        query={query}
        subject="the job monitor"
        tableId="ops-jobs"
        caption="Background job runs"
        rowNoun="runs"
        columns={columns({
          canReplay,
          replayingId: replay.isPending ? (replay.variables?.id ?? null) : null,
          onReplay: (run) => replay.mutate(run),
        })}
        rows={rows}
        rowKey={(row) => row.id}
        defaultSort={{ columnId: 'scheduledAt', direction: 'desc' }}
        filterValues={filters}
        onFilterValuesChange={setFilters}
        exportName="job-runs"
        filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
      />
    </OpsScreen>
  );
}
