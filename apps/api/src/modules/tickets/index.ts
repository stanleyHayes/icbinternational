/**
 * The tickets module's public surface.
 *
 * Other lanes import from here, never from a file inside. Nothing outside this directory
 * has any business knowing how a conversation is stored — and, deliberately, nothing
 * exported here can answer a customer: replying is behind `TicketAgentService`, which is
 * not exported, because a reply signed by something other than a named agent is a reply
 * nobody can be asked about.
 *
 * `TicketOpenService` is the one exception, and it is exported for a named caller rather
 * than on principle: the fraud-report acknowledgement in `packages/api-client` carries a
 * `ticketId`, so whoever builds `/fraud-reports` has to be able to open a conversation on
 * the customer's behalf. A fraud report the customer cannot follow in the app is a fraud
 * report they will phone about instead.
 */

export { TicketsModule } from './tickets.module.js';

export { TicketOpenService, type OpenTicketInput } from './ticket-open.service.js';
export { TicketQueryService } from './ticket-query.service.js';

export {
  TicketStore,
  type MarkReadInput,
  type NewTicket,
  type TicketAudience,
  type TicketChange,
  type TicketListQuery,
  type TicketMessageRecord,
  type TicketPatch,
  type TicketRecord,
} from './ticket.store.js';
export { TicketRepository } from './ticket.repository.js';
export { InMemoryTicketStore } from './in-memory-ticket.store.js';

export { TicketNotifier } from './ports/ticket-notifier.port.js';

export { toContractTicket, toTicketRecord, unreadCountFor } from './ticket.mapper.js';
export {
  customerDisplayName,
  excerptOf,
  formatRespondBy,
  ticketMessageId,
} from './ticket-format.js';
export {
  isSettled,
  owesReply,
  priorityForTopic,
  slaDueAtFor,
  statusAfterAgentReply,
  statusAfterCustomerMessage,
  SETTLED_STATUSES,
} from './domain/ticket-lifecycle.js';
export {
  MAX_ATTACHMENT_IDS,
  PRIORITY_BY_TOPIC,
  SLA_HOURS_BY_PRIORITY,
  TICKET_COLLECTION,
  TICKET_MODEL,
} from './tickets.constants.js';
export { TicketSchema, TicketSchemaClass, type TicketDocument } from './ticket.schema.js';
