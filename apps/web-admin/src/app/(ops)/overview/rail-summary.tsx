/**
 * Whether the outside world is answering.
 *
 * Read-only here. Changing how a rail behaves belongs on the operations-control screen,
 * behind its own permission, because turning a clearing rail off is a decision with a
 * bridge call attached to it and not something to do from a dashboard by accident.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { Permission, type RailBehaviour } from '@reliance/contracts';
import { StatusPill } from '@reliance/ui';

import { Panel, QueryState, opsKeys, railLabel, railStatus } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { usePermissions } from '@/lib/permissions';

/** How long rail health is trusted before it is re-read. */
const RAIL_STALE_MS = 30_000;

function RailRow({ rail }: Readonly<{ rail: RailBehaviour }>) {
  const status = railStatus(rail);

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className="font-body text-fg text-sm font-medium">{railLabel(rail.rail)}</span>
        <span className="font-body text-fg-muted text-xs">{status.detail}</span>
      </span>
      <StatusPill tone={status.tone} label={status.label} />
    </li>
  );
}

/** Counterparty rail health, as the platform currently reports it. */
export function RailSummary() {
  const client = useApiClient();
  const allowed = usePermissions().has(Permission.SIMULATION_RUN);

  const query = useQuery({
    queryKey: opsKeys.rails(),
    queryFn: async ({ signal }) => (await client.simulation.rails({ signal })).data,
    enabled: allowed,
    staleTime: RAIL_STALE_MS,
  });

  if (!allowed) return null;

  return (
    <Panel
      title="Counterparty rails"
      description="Clearing, settlement and service providers the bank depends on."
      flush
    >
      <QueryState query={query} subject="counterparty rail health">
        <ul className="divide-border flex flex-col divide-y pb-2">
          {(query.data ?? []).map((rail) => (
            <RailRow key={rail.rail} rail={rail} />
          ))}
        </ul>
      </QueryState>
    </Panel>
  );
}
