/**
 * Who owns a ticket, how urgent it is, and where it stands.
 *
 * Separated from the reply composer because these three are what a team lead changes
 * without writing anything, and an agent who has to draft a message in order to reassign a
 * ticket will instead reassign it by shouting across the room.
 *
 * The satisfaction rating is shown here rather than being collected here: it comes from
 * the customer, and a console that let staff enter it would make every rating worthless.
 */

'use client';

import { useState } from 'react';

import { TicketPriority, TicketStatus, type Ticket } from '@reliance/contracts';
import { Alert, Button, FormField, Input, Select } from '@reliance/ui';

import { failureMessage } from '@/components/compliance/kit';
import { formatInstant, humaniseCode } from '@/lib/format';
import { useAdminSession } from '@/lib/session';

import { useUpdateTicket } from './use-tickets';

const STATUS_OPTIONS = Object.values(TicketStatus).map((status) => ({
  value: status,
  label: humaniseCode(status),
}));

const PRIORITY_OPTIONS = Object.values(TicketPriority).map((priority) => ({
  value: priority,
  label: humaniseCode(priority),
}));

function Satisfaction({ ticket }: Readonly<{ ticket: Ticket }>) {
  if (ticket.satisfactionRating === null) {
    return (
      <p className="font-body text-fg-muted text-sm">
        The customer has not rated this conversation. They are asked once it is resolved.
      </p>
    );
  }

  return (
    <p className="font-body text-fg text-sm">
      The customer rated this conversation{' '}
      <span className="font-mono tabular-nums">{ticket.satisfactionRating} out of 5</span>
      {ticket.resolvedAt ? `, resolved ${formatInstant(ticket.resolvedAt)}` : ''}.
    </p>
  );
}

const AGENT_HINT = 'The name the customer sees on our replies.';

interface StateRowProps {
  readonly ticket: Ticket;
  readonly disabled: boolean;
  readonly onStatus: (status: TicketStatus) => void;
  readonly onPriority: (priority: TicketPriority) => void;
}

function StateRow({ ticket, disabled, onStatus, onPriority }: StateRowProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="State">
        <Select
          value={ticket.status}
          options={STATUS_OPTIONS}
          disabled={disabled}
          onChange={(event) => onStatus(event.target.value as TicketStatus)}
        />
      </FormField>

      <FormField label="Priority">
        <Select
          value={ticket.priority}
          options={PRIORITY_OPTIONS}
          disabled={disabled}
          onChange={(event) => onPriority(event.target.value as TicketPriority)}
        />
      </FormField>
    </div>
  );
}

interface ActionRowProps {
  readonly canSave: boolean;
  /** The signed-in agent's name, when taking the ticket is available. */
  readonly takeName: string | null;
  readonly escalated: boolean;
  readonly isSaving: boolean;
  readonly onSave: () => void;
  readonly onTake: (name: string) => void;
  readonly onEscalate: () => void;
}

function ActionRow(props: ActionRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={!props.canSave} loading={props.isSaving} onClick={props.onSave}>
        Save the assignment
      </Button>
      {props.takeName && (
        <Button
          size="sm"
          variant="secondary"
          loading={props.isSaving}
          onClick={() => props.onTake(props.takeName ?? '')}
        >
          Take this ticket
        </Button>
      )}
      <Button
        size="sm"
        variant="danger"
        disabled={props.escalated}
        loading={props.isSaving}
        onClick={props.onEscalate}
      >
        Escalate
      </Button>
    </div>
  );
}

export interface TicketControlsProps {
  readonly ticket: Ticket;
}

/** The four changes a lead makes to a ticket without writing anything. */
function useTicketActions(ticket: Ticket) {
  const [agent, setAgent] = useState(ticket.assignedAgentName ?? '');
  const update = useUpdateTicket();

  return {
    agent,
    setAgent,
    update,
    setStatus: (status: TicketStatus) => update.mutate({ ticketId: ticket.id, status }),
    setPriority: (priority: TicketPriority) => update.mutate({ ticketId: ticket.id, priority }),
    assign: (name: string) => {
      setAgent(name);
      update.mutate({ ticketId: ticket.id, assignedAgentName: name });
    },
    escalate: () =>
      update.mutate({
        ticketId: ticket.id,
        status: TicketStatus.ESCALATED,
        priority: TicketPriority.URGENT,
      }),
  };
}

/** Assignment, priority, state and the customer's rating. */
export function TicketControls({ ticket }: TicketControlsProps) {
  const { operator } = useAdminSession();
  const { agent, assign, escalate, setAgent, setPriority, setStatus, update } =
    useTicketActions(ticket);

  const mine = operator !== null && ticket.assignedAgentName === operator.fullName;

  return (
    <div className="flex flex-col gap-3">
      {update.isError && <Alert tone="danger">{failureMessage(update.error)}</Alert>}

      <StateRow
        ticket={ticket}
        disabled={update.isPending}
        onStatus={setStatus}
        onPriority={setPriority}
      />

      <FormField label="Assigned agent" hint={AGENT_HINT}>
        <Input
          value={agent}
          disabled={update.isPending}
          onChange={(event) => setAgent(event.target.value)}
        />
      </FormField>

      <ActionRow
        canSave={agent !== (ticket.assignedAgentName ?? '')}
        takeName={operator && !mine ? operator.fullName : null}
        escalated={ticket.status === TicketStatus.ESCALATED}
        isSaving={update.isPending}
        onSave={() => assign(agent)}
        onTake={assign}
        onEscalate={escalate}
      />

      <Satisfaction ticket={ticket} />
    </div>
  );
}
