import { NOTIFICATION_LOCALE, REPLY_EXCERPT_LENGTH } from './tickets.constants.js';

/**
 * A message's identifier: its position in the thread.
 *
 * Every other id in the contract is an `entityId(prefix)` — a prefixed ULID naming
 * something that exists on its own. `ticketMessageSchema.id` is a bare string, and that
 * difference is the contract saying a message is part of a ticket rather than an entity
 * beside it. Nothing addresses a message except through the ticket that holds it, so it
 * needs no identifier space of its own, and widening the frozen package to give it one
 * would be adding a fiction.
 *
 * Position is a safe basis because messages are only ever appended, never inserted or
 * removed: an id rendered once keeps pointing at the same words forever.
 */
export function ticketMessageId(sequence: number): string {
  return `m${sequence}`;
}

/**
 * A reply time as the customer reads it, e.g. `12 April 2026 at 14:30`.
 *
 * Given to the hour rather than the day because the commitment on an urgent conversation
 * is measured in hours, and "we will reply by Tuesday" is not the promise the bank made.
 */
export function formatRespondBy(date: Date): string {
  return new Intl.DateTimeFormat(NOTIFICATION_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * The opening of a reply, for the preview line of a notification.
 *
 * Deliberately short. The notification exists to bring the customer back to the thread,
 * and an email carrying the whole answer is an email that has to be as carefully handled
 * as the thread it copies — including when it lands in an inbox somebody else can read.
 */
export function excerptOf(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= REPLY_EXCERPT_LENGTH) return collapsed;
  return `${collapsed.slice(0, REPLY_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

/** The name a customer signs their own messages with. */
export function customerDisplayName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
