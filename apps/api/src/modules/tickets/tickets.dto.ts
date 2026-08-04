/**
 * Request shapes the frozen contract does not name.
 *
 * `packages/contracts` defines the ticket, the body that opens one, the body that adds a
 * message to one and the query over the list. It does not define what a customer sends to
 * close a conversation, or what an agent sends to change one — yet both routes exist and
 * `packages/api-client` already calls them, so the schemas have to exist somewhere.
 *
 * They are built from the contract's own primitives rather than reinvented, so a document
 * id is validated the same way here as everywhere else, and they live in the API because
 * inventing shapes inside a frozen package is how a contract stops being frozen.
 */

import { z } from 'zod';

import {
  entityId,
  type listTicketsQuerySchema,
  longTextSchema,
  type postTicketMessageRequestSchema,
  shortTextSchema,
  TicketPriority,
  TicketStatus,
} from '@reliance/contracts';

import {
  MAX_ATTACHMENT_IDS,
  MAX_SATISFACTION_RATING,
  MIN_SATISFACTION_RATING,
} from './tickets.constants.js';

/**
 * Types the contract package defines schemas for but does not name.
 *
 * Inferred here rather than re-declared, so the shape a handler is typed against is the
 * shape the pipe produced and the two cannot disagree.
 */
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type PostTicketMessageRequest = z.infer<typeof postTicketMessageRequestSchema>;

const satisfactionRatingSchema = z
  .number()
  .int()
  .min(MIN_SATISFACTION_RATING)
  .max(MAX_SATISFACTION_RATING);

/**
 * What a customer sends to `PATCH /tickets/:id`.
 *
 * `status` is a literal rather than the full enum. A customer may end their own
 * conversation and nothing else — letting them post `RESOLVED` would put the bank's word
 * for a finished case in the customer's mouth, and letting them post `ESCALATED` would
 * hand the queue's priority ordering to whoever shouts.
 */
export const closeTicketRequestSchema = z.object({
  status: z.literal(TicketStatus.CLOSED),
  satisfactionRating: satisfactionRatingSchema.optional(),
});
export type CloseTicketRequest = z.infer<typeof closeTicketRequestSchema>;

/**
 * What an agent sends to `PATCH /admin/tickets/:id`.
 *
 * One body covers replying, reassigning, reprioritising and resolving because the console
 * sends them together: "answer this, mark it awaiting the customer and hand it to
 * payments" is one action in an agent's head, and splitting it into three requests would
 * make two of them fail independently of the one that mattered.
 *
 * An empty `assignedAgentName` is how the console's text input says "nobody". It is
 * admitted deliberately, because the alternative is a lead who cannot give a ticket back.
 */
export const agentTicketUpdateRequestSchema = z
  .object({
    reply: longTextSchema.optional(),
    attachmentIds: z.array(entityId('doc')).max(MAX_ATTACHMENT_IDS).default([]),
    status: z.enum(TicketStatus).optional(),
    priority: z.enum(TicketPriority).optional(),
    assignedAgentName: shortTextSchema.or(z.literal('')).optional(),
  })
  .refine(hasSomethingToDo, {
    message: 'Include a reply, a status, a priority or an assignment.',
  });
export type AgentTicketUpdateRequest = z.infer<typeof agentTicketUpdateRequestSchema>;

/**
 * An empty patch is a mistake, not a no-op.
 *
 * Accepting one would write an audit event saying an agent changed a ticket, and put their
 * name against a case they did nothing to.
 */
function hasSomethingToDo(request: {
  reply?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedAgentName?: string;
}): boolean {
  return (
    request.reply !== undefined ||
    request.status !== undefined ||
    request.priority !== undefined ||
    request.assignedAgentName !== undefined
  );
}
