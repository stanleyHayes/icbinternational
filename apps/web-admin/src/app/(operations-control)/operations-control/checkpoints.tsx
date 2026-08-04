/**
 * Restore points.
 *
 * A checkpoint is the state of the whole book at an instant, taken before a change nobody
 * wants to unpick by hand — a migration, a re-pricing, a bulk correction. Restoring one
 * discards everything since, which is not a warning to bury: the panel says it, names what
 * the checkpoint holds, and asks for a reason before it will act.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Snapshot } from '@reliance/contracts';
import { Alert, Button, FormField, Input } from '@reliance/ui';

import { Panel, QueryState, ReasonDialog, opsKeys } from '@/components/ops';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatCount, formatInstant } from '@/lib/format';

/** Checkpoints read per page. */
const PAGE_SIZE = 50;

function contentsOf(snapshot: Snapshot): string {
  return Object.entries(snapshot.documentCounts)
    .map(([collection, count]) => `${formatCount(count)} ${collection}`)
    .join(', ');
}

/**
 * A timestamp column: monospaced so digits line up, and sorted on the raw ISO string
 * rather than the rendered text, which sorts alphabetically and lies.
 */
function instantColumn(id: 'simulatedAt' | 'createdAt', header: string): DataColumn<Snapshot> {
  return {
    id,
    header,
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row[id])}</span>,
    csv: (row) => row[id],
    sortValue: (row) => row[id],
  };
}

function columns(onRestore: (snapshot: Snapshot) => void): readonly DataColumn<Snapshot>[] {
  return [
    {
      id: 'label',
      header: 'Checkpoint',
      alwaysVisible: true,
      cell: (row) => row.label,
      csv: (row) => row.label,
    },
    {
      id: 'description',
      header: 'Why it was taken',
      cell: (row) => row.description ?? '—',
      csv: (row) => row.description ?? '',
    },
    {
      id: 'contents',
      header: 'What it holds',
      cell: (row) => contentsOf(row),
      csv: (row) => contentsOf(row),
    },
    instantColumn('simulatedAt', 'Business date (UTC)'),
    instantColumn('createdAt', 'Taken (UTC)'),
    {
      id: 'restore',
      header: 'Restore',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="danger" onClick={() => onRestore(row)}>
          Restore to here
        </Button>
      ),
      csv: (row) => row.id,
    },
  ];
}

/** The capture form's state and its one write, so the form itself is only markup. */
function useCapture() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');

  const capture = useMutation({
    mutationFn: async () =>
      client.simulation.createSnapshot({
        label: label.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      setLabel('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: opsKeys.checkpoints() });
    },
  });

  return { label, setLabel, description, setDescription, capture };
}

function CaptureForm() {
  const { label, setLabel, description, setDescription, capture } = useCapture();

  return (
    <div className="flex flex-col gap-3">
      {capture.error && <Alert tone="danger">{messageFor(capture.error)}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" required hint="How the desk will recognise it later.">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
        </FormField>
        <FormField label="Why" hint="What is about to happen that this protects against.">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
      </div>
      <div>
        <Button
          variant="secondary"
          loading={capture.isPending}
          disabled={label.trim().length === 0}
          onClick={() => capture.mutate()}
        >
          Take a checkpoint
        </Button>
      </div>
    </div>
  );
}

/** The register itself: load, retry, table. */
function CheckpointRegister({ onRestore }: { readonly onRestore: (snapshot: Snapshot) => void }) {
  const client = useApiClient();

  const query = useQuery({
    queryKey: opsKeys.checkpoints(),
    queryFn: async ({ signal }) => client.simulation.snapshots({ limit: PAGE_SIZE }, { signal }),
  });

  return (
    <QueryState query={query} subject="the checkpoint register">
      <DataTable
        tableId="ops-checkpoints"
        caption="Restore points"
        rowNoun="checkpoints"
        columns={columns(onRestore)}
        rows={query.data?.data ?? []}
        rowKey={(row) => row.id}
        defaultSort={{ columnId: 'createdAt', direction: 'desc' }}
        exportName="checkpoints"
      />
    </QueryState>
  );
}

/** The checkpoint register, with capture and restore. */
export function Checkpoints() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState<Snapshot | null>(null);

  const restore = useMutation({
    mutationFn: async (snapshot: Snapshot) => client.simulation.restoreSnapshot(snapshot.id),
    onSuccess: () => {
      setRestoring(null);
      // Everything, not just the register: a restore rewinds the whole book, so any
      // cached answer taken before it is now describing a state that no longer exists.
      queryClient.invalidateQueries();
    },
  });

  return (
    <Panel
      title="Restore points"
      description="The state of the whole book at an instant, and the way back to it."
      flush
    >
      <div className="flex flex-col gap-4 px-5 pb-5">
        <CaptureForm />
        <CheckpointRegister onRestore={setRestoring} />
      </div>

      <ReasonDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title={`Restore to "${restoring?.label ?? ''}"`}
        description="Everything recorded since this checkpoint is discarded, including postings, decisions and audit entries. This cannot be undone."
        confirmLabel="Restore the book"
        destructive
        isSubmitting={restore.isPending}
        error={restore.error ? messageFor(restore.error) : null}
        onConfirm={() => restoring && restore.mutate(restoring)}
      />
    </Panel>
  );
}
