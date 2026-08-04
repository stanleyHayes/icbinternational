/**
 * The ticket lifecycle, as pure facts.
 *
 * Nothing here knows about Nest, Mongo or HTTP. It answers "whose move is it?" and "when
 * do we owe an answer?", so the services can decide what to write and the rules can be
 * pinned down without standing any infrastructure up.
 */

import { type TicketPriority, TicketStatus, type TicketTopic } from '@reliance/contracts';

import { PRIORITY_BY_TOPIC, SLA_HOURS_BY_PRIORITY } from '../tickets.constants.js';

/**
 * Statuses in which the conversation is over.
 *
 * `RESOLVED` is the bank's word for it and `CLOSED` is the customer's; both are settled,
 * and neither is final. A customer who replies reopens the case — the resolution email
 * promises exactly that, and a promise made in an email has to be made true by the code.
 */
export const SETTLED_STATUSES: readonly TicketStatus[] = Object.freeze([
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
]);

/** Whether the conversation has been put to bed by either side. */
export function isSettled(status: TicketStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

/**
 * Whether the bank still owes this customer a reply.
 *
 * The same test the agent console's SLA board applies, kept here so the board and the
 * stored deadline cannot disagree about which tickets are the bank's move.
 */
export function owesReply(status: TicketStatus): boolean {
  return !isSettled(status) && status !== TicketStatus.AWAITING_CUSTOMER;
}

/** What the bank treats a conversation as, before anybody has read it. */
export function priorityForTopic(topic: TicketTopic): TicketPriority {
  return PRIORITY_BY_TOPIC[topic];
}

/**
 * When the bank has committed to answer by, or `null` when the move is not the bank's.
 *
 * A ticket waiting on the customer carries no deadline rather than a stale one: an SLA
 * board that counts tickets nobody at the bank can act on is a board that gets ignored,
 * and one ignored board is worse than none.
 */
export function slaDueAtFor(input: {
  status: TicketStatus;
  priority: TicketPriority;
  now: Date;
}): Date | null {
  if (!owesReply(input.status)) return null;
  return new Date(input.now.getTime() + SLA_HOURS_BY_PRIORITY[input.priority] * MS_PER_HOUR);
}

/**
 * Where a conversation goes when the customer writes.
 *
 * An escalated case stays escalated — the customer adding detail is not the bank deciding
 * the case no longer needs a specialist. Everything else, including a settled case, lands
 * back in the queue.
 */
export function statusAfterCustomerMessage(status: TicketStatus): TicketStatus {
  return status === TicketStatus.ESCALATED ? status : TicketStatus.AWAITING_AGENT;
}

/** Where a conversation goes when an agent replies without saying otherwise. */
export function statusAfterAgentReply(status: TicketStatus): TicketStatus {
  return status === TicketStatus.ESCALATED ? status : TicketStatus.AWAITING_CUSTOMER;
}

const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
