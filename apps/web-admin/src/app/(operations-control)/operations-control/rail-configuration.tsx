/**
 * Rail configuration.
 *
 * Latency budgets and the failure tolerance the bank holds each counterparty to, plus the
 * switch that takes a rail out of service. Taking a rail out is a real operational action —
 * a clearing house declares an incident and the bank stops presenting to it — and payments
 * queue rather than fail, which is what the panel says before anyone clicks.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { RailBehaviour } from '@reliance/contracts';
import { Alert, Button, Input, StatusPill, Switch } from '@reliance/ui';

import {
  Panel,
  QueryState,
  opsKeys,
  railDescription,
  railLabel,
  railStatus,
} from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatBasisPoints } from '@/lib/format';

const CELL = 'px-3 py-2 align-middle';
const HEAD = 'px-3 py-2 text-left font-medium text-fg-muted';

interface RowProps {
  readonly rail: RailBehaviour;
  readonly onPatch: (patch: Partial<RailBehaviour>) => void;
  readonly disabled: boolean;
}

/**
 * A numeric setting, committed on blur rather than on every keystroke.
 *
 * `defaultValue` and `onBlur` together make this uncontrolled on purpose: a controlled
 * input that writes through on change would fire a request per digit, and a half-typed
 * "25" would briefly configure the rail to 2.
 */
function NumericCell({
  value,
  unit,
  label,
  disabled,
  onCommit,
}: {
  readonly value: number;
  readonly unit: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly onCommit: (next: number) => void;
}) {
  return (
    <td className={CELL}>
      <Input
        inputSize="sm"
        inputMode="numeric"
        disabled={disabled}
        aria-label={label}
        defaultValue={String(value)}
        suffix={<span className="text-fg-muted text-xs">{unit}</span>}
        onBlur={(event) => onCommit(Number(event.target.value) || 0)}
      />
    </td>
  );
}

/** The row header: what the rail is called, and what it actually is. */
function RailNameCell({ rail, label }: { readonly rail: RailBehaviour; readonly label: string }) {
  return (
    <th scope="row" className={`${CELL} text-left font-normal`}>
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-fg-muted text-xs">{railDescription(rail.rail)}</span>
      </span>
    </th>
  );
}

function RailRow({ rail, onPatch, disabled }: RowProps) {
  const status = railStatus(rail);
  const label = railLabel(rail.rail);

  return (
    <tr className="border-border border-b last:border-0">
      <RailNameCell rail={rail} label={label} />
      <td className={CELL}>
        <StatusPill tone={status.tone} label={status.label} />
      </td>
      <NumericCell
        value={rail.failureRateBps}
        unit="bps"
        label={`Return tolerance for ${label} in basis points`}
        disabled={disabled}
        onCommit={(failureRateBps) => onPatch({ failureRateBps })}
      />
      <NumericCell
        value={rail.latencyMaxMs}
        unit="ms"
        label={`Slowest acceptable response for ${label} in milliseconds`}
        disabled={disabled}
        onCommit={(latencyMaxMs) => onPatch({ latencyMaxMs })}
      />
      <td className={CELL}>
        <Switch
          checked={rail.forceOutage}
          disabled={disabled}
          aria-label={`Take ${label} out of service`}
          onChange={(event) => onPatch({ forceOutage: event.target.checked })}
        />
      </td>
      <td className={`${CELL} text-fg-muted text-right text-xs`}>
        {formatBasisPoints(rail.failureRateBps)} returned
      </td>
    </tr>
  );
}

interface RailTableProps {
  readonly rails: readonly RailBehaviour[];
  readonly disabled: boolean;
  readonly onPatch: (rail: RailBehaviour, change: Partial<RailBehaviour>) => void;
}

/** Column headings, in order. The last is right-aligned to sit over its numbers. */
const HEADINGS = [
  'Rail',
  'Health',
  'Return tolerance',
  'Slowest acceptable',
  'Out of service',
  'Reads as',
] as const;

function RailTableHead() {
  return (
    <thead>
      <tr className="border-border bg-surface-sunken border-b">
        {HEADINGS.map((heading, index) => (
          <th
            key={heading}
            scope="col"
            className={index === HEADINGS.length - 1 ? `${HEAD} text-right` : HEAD}
          >
            {heading}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function RailTable({ rails, disabled, onPatch }: RailTableProps) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="font-body w-full border-collapse text-sm">
        <caption className="sr-only">Counterparty rails and their configuration</caption>
        <RailTableHead />
        <tbody>
          {rails.map((rail) => (
            <RailRow
              key={rail.rail}
              rail={rail}
              disabled={disabled}
              onPatch={(change) => onPatch(rail, change)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The rail table and the one write that maintains it.
 *
 * The API takes the whole set rather than one rail, so a single change is expressed as the
 * current list with that rail replaced — which is also why `rails` has to be read before
 * any edit can be sent.
 */
function useRails() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: opsKeys.rails(),
    queryFn: async ({ signal }) => (await client.simulation.rails({ signal })).data,
  });

  const save = useMutation({
    mutationFn: async (rails: readonly RailBehaviour[]) => client.simulation.setRails(rails),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: opsKeys.rails() }),
  });

  const rails = query.data ?? [];
  const patch = (rail: RailBehaviour, change: Partial<RailBehaviour>): void => {
    save.mutate(
      rails.map((candidate) =>
        candidate.rail === rail.rail ? { ...candidate, ...change } : candidate,
      ),
    );
  };

  return { query, save, rails, patch };
}

/** Rail health, latency budgets and the out-of-service switch. */
export function RailConfiguration() {
  const { query, save, rails, patch } = useRails();

  return (
    <Panel
      title="Rail configuration"
      description="Latency budgets, return tolerance, and taking a counterparty out of service."
      action={
        <Button
          size="sm"
          variant="ghost"
          loading={query.isFetching}
          onClick={() => {
            query.refetch();
          }}
        >
          Refresh
        </Button>
      }
      flush
    >
      <div className="flex flex-col gap-3 px-5 pb-5">
        {save.error && <Alert tone="danger">{messageFor(save.error)}</Alert>}

        <Alert tone="warning" title="Taking a rail out of service">
          Nothing is presented to it while it is out. Payments queue and settle when it returns;
          none of them fail, and none of them are lost.
        </Alert>

        <QueryState query={query} subject="the rail configuration">
          <RailTable rails={rails} disabled={save.isPending} onPatch={patch} />
        </QueryState>
      </div>
    </Panel>
  );
}
