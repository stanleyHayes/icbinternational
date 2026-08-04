/**
 * The support console.
 *
 * The SLA board sits above the queue rather than on a separate screen, because the numbers
 * are only useful while somebody is in a position to act on them. A team lead who has to
 * navigate to a dashboard to learn that four tickets have missed their reply time will
 * learn it tomorrow.
 *
 * Thread and controls are side by side beneath the queue, so replying, reassigning and
 * closing all happen without leaving the list an agent is working down.
 */

'use client';

import { useState } from 'react';

import { TicketStatus, TicketTopic } from '@reliance/contracts';
import { EmptyState } from '@reliance/ui';

import {
  ConsoleScreen,
  QueueError,
  QueueLoading,
  ScreenPanel,
  useConsoleNow,
} from '@/components/compliance/kit';
import { DataTable, FilterBar, type FilterSpec } from '@/components/shell/ops';
import { humaniseCode } from '@/lib/format';

import { averageSatisfaction, SlaBoard } from './sla-board';
import { ticketColumns } from './ticket-columns';
import { TicketControls } from './ticket-controls';
import { TicketThread } from './ticket-thread';
import { useTicket, useTickets } from './use-tickets';

const DESCRIPTION =
  'Customer conversations, the reply times we have committed to, and who owns each one. ' +
  'Everything sent from here goes to the customer as written.';

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'State',
    kind: 'select',
    options: Object.values(TicketStatus).map((status) => ({
      value: status,
      label: humaniseCode(status),
    })),
  },
  {
    id: 'topic',
    label: 'Topic',
    kind: 'select',
    options: Object.values(TicketTopic).map((topic) => ({
      value: topic,
      label: humaniseCode(topic),
    })),
  },
  { id: 'agent', label: 'Agent', kind: 'text', placeholder: 'Name' },
];

/** Applies the on-screen filters. Kept local so the SLA board counts the whole queue. */
function applyFilters<
  T extends { status: string; topic: string; assignedAgentName: string | null },
>(rows: readonly T[], filters: Readonly<Record<string, string>>): readonly T[] {
  const agent = filters.agent?.trim().toLowerCase() ?? '';

  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.topic && row.topic !== filters.topic) return false;
    if (agent && !(row.assignedAgentName ?? '').toLowerCase().includes(agent)) return false;
    return true;
  });
}

interface WorkspaceProps {
  readonly openId: string | null;
  readonly detail: ReturnType<typeof useTicket>;
}

function Workspace({ openId, detail }: WorkspaceProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
      <ScreenPanel title="Conversation">
        {openId === null && (
          <EmptyState
            title="Choose a ticket"
            description="Select a row to read the conversation and reply to the customer."
          />
        )}
        {detail.isLoading && <QueueLoading label="the conversation" />}
        {detail.isError && (
          <QueueError error={detail.error} subject="this conversation" onRetry={detail.refetch} />
        )}
        {detail.data && <TicketThread ticket={detail.data} />}
      </ScreenPanel>

      <ScreenPanel title="Ticket">
        {detail.data ? (
          <TicketControls ticket={detail.data} />
        ) : (
          <p className="font-body text-fg-muted text-sm">
            Assignment, priority and escalation appear once a ticket is open.
          </p>
        )}
      </ScreenPanel>
    </div>
  );
}

/** The support screen. */
export function TicketConsole() {
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const nowMs = useConsoleNow();

  const queue = useTickets();
  const detail = useTicket(openId);

  const all = queue.data?.data ?? [];
  const rows = applyFilters(all, filters);

  return (
    <ConsoleScreen title="Support" description={DESCRIPTION}>
      <SlaBoard tickets={all} nowMs={nowMs} />

      <ScreenPanel title="Queue" flush>
        {queue.isPending && <QueueLoading label="support tickets" />}
        {queue.isError && (
          <QueueError error={queue.error} subject="the support queue" onRetry={queue.refetch} />
        )}
        {queue.data && (
          <DataTable
            tableId="support-tickets"
            caption="Customer support tickets"
            rowNoun="tickets"
            columns={ticketColumns(nowMs, openId, setOpenId)}
            rows={rows}
            rowKey={(ticket) => ticket.id}
            totalCount={queue.data.page.total}
            exportName="support-tickets"
            defaultSort={{ columnId: 'sla', direction: 'asc' }}
            filterValues={filters}
            onFilterValuesChange={setFilters}
            filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
          />
        )}
      </ScreenPanel>

      <p className="font-body text-fg-muted text-sm">
        Customer satisfaction across rated conversations: {averageSatisfaction(all)}.
      </p>

      <Workspace openId={openId} detail={detail} />
    </ConsoleScreen>
  );
}
