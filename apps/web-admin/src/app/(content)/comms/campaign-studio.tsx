/**
 * Campaigns.
 *
 * A campaign is a template plus an audience plus a moment. The list shows what each one
 * reached and what happened to it; the form schedules the next. Scheduling asks for a date
 * because sending to a whole segment at four in the afternoon on a Friday is a decision,
 * not a default.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { CommsCampaign } from '@reliance/api-client';
import { Permission } from '@reliance/contracts';
import { Alert, Button, Dialog, FormField, Input, Select, StatusPill } from '@reliance/ui';

import { DialogActions, Panel, QueryState, opsKeys, toneForCampaign } from '@/components/ops';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatCount, formatInstant, humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';

/** Campaigns read per page. */
const PAGE_SIZE = 100;

/** Sends go out mid-morning unless a time is chosen, which is when people read email. */
const SEND_TIME = 'T10:00:00Z';

const SEGMENTS = [
  { value: 'all-customers', label: 'Every customer' },
  { value: 'new-this-month', label: 'Opened an account this month' },
  { value: 'savers', label: 'Holds a savings product' },
  { value: 'borrowers', label: 'Holds a loan or overdraft' },
  { value: 'dormant', label: 'No activity in ninety days' },
];

const COLUMNS: readonly DataColumn<CommsCampaign>[] = [
  {
    id: 'name',
    header: 'Campaign',
    alwaysVisible: true,
    cell: (row) => row.name,
    csv: (row) => row.name,
  },
  { id: 'segment', header: 'Audience', cell: (row) => row.segment, csv: (row) => row.segment },
  {
    id: 'status',
    header: 'State',
    alwaysVisible: true,
    cell: (row) => (
      <StatusPill tone={toneForCampaign(row.status)} label={humaniseCode(row.status)} />
    ),
    csv: (row) => row.status,
  },
  {
    id: 'audienceSize',
    header: 'Audience size',
    align: 'end',
    cell: (row) => formatCount(row.audienceSize),
    csv: (row) => String(row.audienceSize),
    sortValue: (row) => row.audienceSize,
  },
  {
    id: 'sentCount',
    header: 'Sent',
    align: 'end',
    cell: (row) => formatCount(row.sentCount),
    csv: (row) => String(row.sentCount),
    sortValue: (row) => row.sentCount,
  },
  {
    id: 'openCount',
    header: 'Opened',
    align: 'end',
    cell: (row) => formatCount(row.openCount),
    csv: (row) => String(row.openCount),
    sortValue: (row) => row.openCount,
  },
  {
    id: 'clickCount',
    header: 'Followed a link',
    align: 'end',
    cell: (row) => formatCount(row.clickCount),
    csv: (row) => String(row.clickCount),
    sortValue: (row) => row.clickCount,
  },
  {
    id: 'scheduledFor',
    header: 'Scheduled (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.scheduledFor)}</span>,
    csv: (row) => row.scheduledFor ?? '',
    sortValue: (row) => row.scheduledFor ?? '',
  },
  {
    id: 'sentAt',
    header: 'Sent (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.sentAt)}</span>,
    csv: (row) => row.sentAt ?? '',
  },
];

interface ScheduleDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** The dialog's three fields and the send they compose into. */
function useScheduleForm(onClose: () => void) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [segment, setSegment] = useState(SEGMENTS[0]?.value ?? '');
  const [date, setDate] = useState('');

  const schedule = useMutation({
    mutationFn: async () =>
      client.admin.createCampaign({
        name: name.trim(),
        segment,
        // No date means a draft, not a send at midnight.
        ...(date ? { scheduledFor: `${date}${SEND_TIME}` } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('comms') });
      onClose();
    },
  });

  return { name, setName, segment, setSegment, date, setDate, schedule };
}

function ScheduleDialog({ open, onClose }: ScheduleDialogProps) {
  const { name, setName, segment, setSegment, date, setDate, schedule } = useScheduleForm(onClose);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule a campaign"
      description="Sends one template to a customer segment at a chosen time."
      footer={
        <DialogActions
          confirmLabel="Schedule it"
          onCancel={onClose}
          onConfirm={() => schedule.mutate()}
          pending={schedule.isPending}
          disabled={name.trim().length === 0}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {schedule.error && <Alert tone="danger">{messageFor(schedule.error)}</Alert>}
        <FormField label="Campaign name" required hint="How this send is identified in reporting.">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Audience" required hint="Who receives it.">
          <Select
            value={segment}
            options={SEGMENTS}
            onChange={(event) => setSegment(event.target.value)}
          />
        </FormField>
        <FormField label="Send on" hint="Leave empty to hold it as a draft.">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** The register: load, retry, table. */
function CampaignRegister() {
  const client = useApiClient();

  const query = useQuery({
    queryKey: opsKeys.campaigns(),
    queryFn: async ({ signal }) => client.admin.campaigns({ limit: PAGE_SIZE }, { signal }),
  });

  return (
    <QueryState query={query} subject="the campaign register">
      <DataTable
        tableId="ops-comms-campaigns"
        caption="Campaign sends"
        rowNoun="campaigns"
        columns={COLUMNS}
        rows={query.data?.data ?? []}
        rowKey={(row) => row.id}
        defaultSort={{ columnId: 'scheduledFor', direction: 'desc' }}
        exportName="campaigns"
      />
    </QueryState>
  );
}

/** The campaign register and the scheduler. */
export function CampaignStudio() {
  const [scheduling, setScheduling] = useState(false);

  return (
    <Panel
      title="Campaigns"
      description="Scheduled sends to a customer segment, and how each one performed."
      action={
        <Can permission={Permission.COMMS_SEND}>
          <Button size="sm" onClick={() => setScheduling(true)}>
            Schedule a campaign
          </Button>
        </Can>
      }
      flush
    >
      <CampaignRegister />
      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} />
    </Panel>
  );
}
