/**
 * Reading and answering support tickets.
 *
 * One mutation covers replying, reassigning, reprioritising and resolving, because the
 * platform takes them as one patch and an agent frequently does several at once — reply,
 * set to awaiting-customer, and hand it to the payments team is a single action in their
 * head and should be a single request.
 *
 * The queue is refetched aggressively. Two agents working the same queue who both open the
 * same ticket is the most common annoyance in a support console, and a short stale window
 * is most of the fix.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Ticket, TicketPriority, TicketStatus } from '@reliance/contracts';

import { CONSOLE_KEY, QUEUE_PAGE_SIZE, queueQueryOptions } from '@/components/compliance/kit';
import { useApiClient } from '@/lib/api-client';

const TICKETS = 'tickets' as const;

/** Cache keys for the support console. */
export const ticketKeys = {
  all: [CONSOLE_KEY, TICKETS] as const,
  queue: [CONSOLE_KEY, TICKETS, 'queue'] as const,
  detail: (ticketId: string) => [CONSOLE_KEY, TICKETS, 'detail', ticketId] as const,
};

/** The whole support queue. Filtering happens on screen, so agents see the same counts. */
export function useTickets() {
  const client = useApiClient();

  return useQuery({
    queryKey: ticketKeys.queue,
    queryFn: async ({ signal }) => client.admin.tickets({ limit: QUEUE_PAGE_SIZE }, { signal }),
    ...queueQueryOptions,
  });
}

/** One ticket, with its full thread. */
export function useTicket(ticketId: string | null) {
  const client = useApiClient();

  return useQuery({
    queryKey: ticketKeys.detail(ticketId ?? ''),
    enabled: ticketId !== null,
    queryFn: async ({ signal }) => (await client.admin.ticket(ticketId ?? '', { signal })).data,
    ...queueQueryOptions,
  });
}

/** A change to one ticket: any combination of reply, reassign, reprioritise, resolve. */
export interface TicketUpdateInput {
  readonly ticketId: string;
  readonly reply?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly assignedAgentName?: string;
}

/** Applies a change to a ticket. */
export function useUpdateTicket() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TicketUpdateInput): Promise<Ticket> => {
      const body: Partial<Ticket> & { reply?: string } = {};
      if (input.reply !== undefined) body.reply = input.reply;
      if (input.status !== undefined) body.status = input.status;
      if (input.priority !== undefined) body.priority = input.priority;
      if (input.assignedAgentName !== undefined) body.assignedAgentName = input.assignedAgentName;

      return (await client.admin.updateTicket(input.ticketId, body)).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketKeys.all }),
  });
}
