/**
 * Feature flags.
 *
 * A rollout percentage is a real proportion of real customers, so it is shown as one — a
 * flag at 2,500 basis points is described as reaching a quarter of the base, not as a
 * number an operator has to convert in their head at the moment they change it.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Permission, type FeatureFlag } from '@reliance/contracts';
import { Badge, Input, Switch } from '@reliance/ui';

import { OpsScreen, Panel, RegisterPanel, opsKeys } from '@/components/ops';
import { type DataColumn } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatBasisPoints, formatInstant } from '@/lib/format';
import { useIsAllowed } from '@/lib/permissions';

import { MAINTENANCE_FLAG_KEY, MaintenanceMode } from './maintenance-mode';

/** Flags read per page. */
const PAGE_SIZE = 100;

/** Basis points in a whole rollout. */
const FULL_ROLLOUT_BPS = 10_000;

function reach(bps: number): string {
  if (bps >= FULL_ROLLOUT_BPS) return 'Everyone';
  if (bps === 0) return 'Nobody';
  return `${formatBasisPoints(bps)} of customers`;
}

interface FlagControls {
  readonly onToggle: (flag: FeatureFlag, enabled: boolean) => void;
  readonly onRollout: (flag: FeatureFlag, bps: number) => void;
  readonly canWrite: boolean;
}

/** What the flag is and who it currently reaches. */
const DESCRIPTIVE_COLUMNS: readonly DataColumn<FeatureFlag>[] = [
  {
    id: 'key',
    header: 'Flag',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-mono text-xs">{row.key}</span>
        <span className="text-fg-muted text-xs">{row.description}</span>
      </span>
    ),
    csv: (row) => `${row.key} — ${row.description}`,
    sortValue: (row) => row.key,
  },
  {
    id: 'reach',
    header: 'Reaches',
    cell: (row) => (row.enabled ? reach(row.rolloutBps) : 'Nobody, the flag is off'),
    csv: (row) => (row.enabled ? reach(row.rolloutBps) : 'off'),
  },
  {
    id: 'segments',
    header: 'Segments',
    cell: (row) =>
      row.segments.length === 0 ? (
        'Everyone in the rollout'
      ) : (
        <span className="flex flex-wrap gap-1">
          {row.segments.map((segment) => (
            <Badge key={segment}>{segment}</Badge>
          ))}
        </span>
      ),
    csv: (row) => row.segments.join(' | '),
  },
  {
    id: 'updatedAt',
    header: 'Changed (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.updatedAt)}</span>,
    csv: (row) => row.updatedAt,
    sortValue: (row) => row.updatedAt,
  },
];

function columns(controls: FlagControls): readonly DataColumn<FeatureFlag>[] {
  return [
    ...DESCRIPTIVE_COLUMNS,
    {
      id: 'enabled',
      header: 'On',
      alwaysVisible: true,
      cell: (row) => (
        <Switch
          checked={row.enabled}
          disabled={!controls.canWrite}
          aria-label={`Turn ${row.key} ${row.enabled ? 'off' : 'on'}`}
          onChange={(event) => controls.onToggle(row, event.target.checked)}
        />
      ),
      csv: (row) => (row.enabled ? 'on' : 'off'),
      sortValue: (row) => (row.enabled ? 'on' : 'off'),
    },
    {
      id: 'rollout',
      header: 'Rollout',
      cell: (row) => (
        <Input
          inputSize="sm"
          inputMode="numeric"
          aria-label={`Rollout for ${row.key} in basis points`}
          defaultValue={String(row.rolloutBps)}
          disabled={!controls.canWrite}
          suffix={<span className="text-fg-muted text-xs">bps</span>}
          onBlur={(event) => controls.onRollout(row, Number(event.target.value) || 0)}
        />
      ),
      csv: (row) => String(row.rolloutBps),
      sortValue: (row) => row.rolloutBps,
    },
  ];
}

/** Feature flags and the maintenance switch. */
/** The flag list and the single patch that edits any one of them. */
function useFlags() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: opsKeys.flags(),
    queryFn: async ({ signal }) => client.admin.flags({ limit: PAGE_SIZE }, { signal }),
  });

  const set = useMutation({
    mutationFn: async (input: { readonly key: string; readonly patch: Partial<FeatureFlag> }) =>
      client.admin.setFlag(input.key, input.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: opsKeys.all('platform') }),
  });

  const flags = query.data?.data ?? [];

  return {
    query,
    set,
    flags,
    // Surfaced separately because it is the one flag customers feel the moment it moves.
    maintenance: flags.find((flag) => flag.key === MAINTENANCE_FLAG_KEY) ?? null,
  };
}

export function FlagsScreen() {
  const canWrite = useIsAllowed(Permission.FLAG_WRITE);
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const { query, set, flags, maintenance } = useFlags();

  return (
    <OpsScreen
      title="Feature flags"
      description="What is switched on, for whom, and how much of the customer base it reaches."
    >
      <Panel
        title="Maintenance"
        description="The one switch on this screen that customers see immediately."
      >
        <MaintenanceMode flag={maintenance} />
      </Panel>

      <RegisterPanel
        title="Flags"
        description="Everything else the platform reads at runtime."
        query={query}
        subject="the feature flags"
        tableId="ops-flags"
        caption="Feature flags"
        rowNoun="flags"
        columns={columns({
          canWrite,
          onToggle: (flag, enabled) => set.mutate({ key: flag.key, patch: { enabled } }),
          onRollout: (flag, rolloutBps) => set.mutate({ key: flag.key, patch: { rolloutBps } }),
        })}
        rows={flags}
        rowKey={(row) => row.key}
        defaultSort={{ columnId: 'key', direction: 'asc' }}
        filterValues={filters}
        onFilterValuesChange={setFilters}
        exportName="feature-flags"
      />
    </OpsScreen>
  );
}
