import { type CreateTicketRequest, TicketTopic } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type UsersService } from '../../auth/users/index.js';
import { InMemoryTicketStore } from '../in-memory-ticket.store.js';
import {
  TicketNotifier,
  type TicketReceivedNotice,
  type TicketRepliedNotice,
  type TicketResolvedNotice,
} from '../ports/ticket-notifier.port.js';
import { TicketAgentService } from '../ticket-agent.service.js';
import { TicketConversationService } from '../ticket-conversation.service.js';
import { TicketOpenService } from '../ticket-open.service.js';
import { TicketQueryService } from '../ticket-query.service.js';
import { type TicketRecord } from '../ticket.store.js';

export const CUSTOMER = 'usr_01JQ8Z0000000000000000000A';
export const STRANGER = 'usr_01JQ8Z0000000000000000000B';
export const CUSTOMER_NAME = 'Ada Whitfield';
export const AGENT_NAME = 'Priya Raman';

const TEST_NOW = new Date('2026-03-01T09:00:00.000Z');

/** Everything the notifier was asked to send, in order. */
export interface SentNotifications {
  received: TicketReceivedNotice[];
  replied: TicketRepliedNotice[];
  resolved: TicketResolvedNotice[];
}

/**
 * A recording `TicketNotifier`.
 *
 * The tests assert on what the customer was told, not on whether a bus was called: the
 * interesting property of this module is that exactly one message leaves per agent action,
 * and that is only observable at this seam.
 */
class RecordingNotifier extends TicketNotifier {
  readonly sent: SentNotifications = { received: [], replied: [], resolved: [] };

  override async ticketReceived(input: TicketReceivedNotice): Promise<void> {
    this.sent.received.push(input);
  }

  override async ticketReplied(input: TicketRepliedNotice): Promise<void> {
    this.sent.replied.push(input);
  }

  override async ticketResolved(input: TicketResolvedNotice): Promise<void> {
    this.sent.resolved.push(input);
  }
}

/**
 * The tickets lane wired end to end over the in-memory store.
 *
 * Everything above the store is real — the lifecycle rules, the ownership check, the
 * unread arithmetic and the notification choice. Only persistence and the customer
 * directory are doubled, and the store double enforces the same two rules the repository
 * does: a change and its message land together, and a read receipt leaves `updatedAt`
 * alone.
 */
export interface TicketsRig {
  store: InMemoryTicketStore;
  clock: ClockService;
  queries: TicketQueryService;
  opening: TicketOpenService;
  conversation: TicketConversationService;
  agents: TicketAgentService;
  sent: SentNotifications;
}

export function ticketsRig(): TicketsRig {
  const clock = new ClockService();
  clock.freezeAt(TEST_NOW);

  const store = new InMemoryTicketStore(new IdGenerator());
  const notifier = new RecordingNotifier();
  const users = fakeUsers();
  const queries = new TicketQueryService(store);

  return {
    store,
    clock,
    queries,
    opening: new TicketOpenService(store, users, notifier, clock),
    conversation: new TicketConversationService(store, queries, users, clock),
    agents: new TicketAgentService(store, queries, notifier, clock),
    sent: notifier.sent,
  };
}

/** Opens a conversation with sensible defaults, overridable field by field. */
export async function openTicket(
  rig: TicketsRig,
  overrides: Partial<CreateTicketRequest> & { userId?: string } = {},
): Promise<TicketRecord> {
  const { userId = CUSTOMER, ...request } = overrides;

  return rig.opening.open({
    userId,
    request: {
      subject: 'Direct Debit taken twice',
      topic: TicketTopic.PAYMENTS,
      body: 'The same collection has left my account on two consecutive days.',
      attachmentIds: [],
      ...request,
    },
  });
}

function fakeUsers(): UsersService {
  const [firstName, lastName] = CUSTOMER_NAME.split(' ');
  return { requireById: async () => ({ firstName, lastName }) } as unknown as UsersService;
}
