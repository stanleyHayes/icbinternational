/**
 * Constants for support tickets.
 *
 * The reply times are the commitment the bank makes in writing the moment a conversation
 * opens, and the agent console's SLA board is scored against them. They are simulated-clock
 * hours: advancing the clock moves every outstanding commitment with it, which is the only
 * way an operator can see a breached queue without waiting a real day for one.
 */

import { TicketPriority, TicketTopic } from '@reliance/contracts';

/** Mongoose model token. */
export const TICKET_MODEL = 'Ticket';

/** MongoDB collection. */
export const TICKET_COLLECTION = 'tickets';

/** Hours the bank has to answer, by priority. */
export const SLA_HOURS_BY_PRIORITY: Readonly<Record<TicketPriority, number>> = Object.freeze({
  [TicketPriority.URGENT]: 1,
  [TicketPriority.HIGH]: 4,
  [TicketPriority.NORMAL]: 24,
  [TicketPriority.LOW]: 48,
});

/**
 * The priority a conversation opens at, from what it is about.
 *
 * The customer is not asked. A person who has just lost money does not rank their own
 * urgency accurately, and a form that let them would be gamed within a week; the topic
 * they picked in order to be routed correctly is the better signal, and it is one they
 * have no reason to lie about.
 */
export const PRIORITY_BY_TOPIC: Readonly<Record<TicketTopic, TicketPriority>> = Object.freeze({
  [TicketTopic.FRAUD]: TicketPriority.URGENT,
  [TicketTopic.COMPLAINT]: TicketPriority.HIGH,
  [TicketTopic.PAYMENTS]: TicketPriority.HIGH,
  [TicketTopic.CARDS]: TicketPriority.NORMAL,
  [TicketTopic.LENDING]: TicketPriority.NORMAL,
  [TicketTopic.ACCOUNT]: TicketPriority.NORMAL,
  [TicketTopic.TECHNICAL]: TicketPriority.NORMAL,
  [TicketTopic.OTHER]: TicketPriority.NORMAL,
});

/** Documents a single message may carry, per the contract's own schemas. */
export const MAX_ATTACHMENT_IDS = 5;

/** Bounds on the rating a customer may leave, matching `ticketSchema`. */
export const MIN_SATISFACTION_RATING = 1;
export const MAX_SATISFACTION_RATING = 5;

/** How much of a reply the notification quotes before the customer has to open the app. */
export const REPLY_EXCERPT_LENGTH = 140;

/** Locale used when rendering a deadline for a customer notification. */
export const NOTIFICATION_LOCALE = 'en-GB';

/** Audit trail entity family. */
export const TICKET_AUDIT_ENTITY = 'ticket';

/**
 * The fields the audit trail keeps on a ticket.
 *
 * Deliberately none of the conversation. An investigator needs to know who owned a case,
 * how urgent the bank called it and when it was closed; the customer's own account of
 * their problem is dense free-text PII, and copying every revision of it into an
 * append-only hash chain is a disclosure the trail does not need to make.
 */
export const TICKET_AUDIT_CAPTURE_FIELDS = Object.freeze([
  'id',
  'topic',
  'status',
  'priority',
  'assignedAgentName',
  'satisfactionRating',
  'slaDueAt',
  'resolvedAt',
]);
