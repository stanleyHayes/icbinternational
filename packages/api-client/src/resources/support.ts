/**
 * Support tickets, disputes and fraud reports.
 *
 * A dispute is not a ticket with a different label. It has a regulated clock, a
 * provisional-credit decision and outcomes that post real ledger entries, so it gets its
 * own methods and its own type rather than being flattened into the ticket flow.
 */

import { z } from 'zod';

import {
  disputeSchema,
  paginated,
  resource,
  routes,
  ticketSchema,
  type CreateDisputeRequest,
  type CreateFraudReportRequest,
  type CreateTicketRequest,
  type CursorQuery,
  type Dispute,
  type DisputeStatus,
  type Paginated,
  type Resource,
  type Ticket,
  type TicketStatus,
  type TicketTopic,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const ticketList = paginated(ticketSchema);
const ticketResource = resource(ticketSchema);
const disputeList = paginated(disputeSchema);
const disputeResource = resource(disputeSchema);

/** Acknowledgement of a fraud report, naming what was frozen. */
export const fraudReportSchema = z.object({
  id: z.string(),
  reference: z.string(),
  frozenCardIds: z.array(z.string()),
  frozenAccountIds: z.array(z.string()),
  ticketId: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: false }),
});
/** A fraud report acknowledgement. */
export type FraudReport = z.infer<typeof fraudReportSchema>;

const fraudReportResource = resource(fraudReportSchema);

/** Filters for the ticket list. */
export type ListTicketsQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: TicketStatus | undefined;
  readonly topic?: TicketTopic | undefined;
};

/** Filters for the dispute list. */
export type ListDisputesQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: DisputeStatus | undefined;
};

/** Body of a new message on a ticket. */
export interface PostTicketMessageRequest {
  readonly body: string;
  readonly attachmentIds?: readonly string[];
}

/** Body of an evidence upload on a dispute. */
export interface AddDisputeEvidenceRequest {
  readonly evidenceIds: readonly string[];
  readonly note?: string;
}

/** Builds the `client.support` group. */
export function createSupportResource(http: HttpTransport) {
  return {
    /** The customer's tickets. */
    listTickets: (query?: ListTicketsQuery, options?: QueryOptions): Promise<Paginated<Ticket>> =>
      http.get({ ...options, path: routes.support.tickets, query, schema: ticketList }),

    /** Opens a ticket. */
    createTicket: (
      body: CreateTicketRequest,
      options?: MutationOptions,
    ): Promise<Resource<Ticket>> =>
      http.post({ ...options, path: routes.support.tickets, body, schema: ticketResource }),

    /** One ticket, with its whole message thread. */
    getTicket: (id: string, options?: QueryOptions): Promise<Resource<Ticket>> =>
      http.get({ ...options, path: routes.support.ticket(id), schema: ticketResource }),

    /** Closes a ticket, optionally rating the service. */
    closeTicket: (
      id: string,
      body?: { readonly satisfactionRating?: number },
      options?: MutationOptions,
    ): Promise<Resource<Ticket>> =>
      http.patch({
        ...options,
        path: routes.support.ticket(id),
        body: { status: 'CLOSED', ...body },
        schema: ticketResource,
      }),

    /** Adds a message to a ticket. */
    postMessage: (
      id: string,
      body: PostTicketMessageRequest,
      options?: MutationOptions,
    ): Promise<Resource<Ticket>> =>
      http.post({
        ...options,
        path: routes.support.ticketMessages(id),
        body,
        schema: ticketResource,
      }),

    /** The customer's disputes. */
    listDisputes: (
      query?: ListDisputesQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Dispute>> =>
      http.get({ ...options, path: routes.support.disputes, query, schema: disputeList }),

    /**
     * Raises a dispute against a transaction.
     *
     * Idempotent by key because the API answers `DISPUTE_ALREADY_RAISED` on a second
     * attempt — without the key, a double-submitted form looks like a duplicate dispute
     * rather than the same one.
     */
    createDispute: (
      body: CreateDisputeRequest,
      options?: MutationOptions,
    ): Promise<Resource<Dispute>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.support.disputes,
        body,
        schema: disputeResource,
      }),

    /** One dispute, with its timeline and any provisional credit. */
    getDispute: (id: string, options?: QueryOptions): Promise<Resource<Dispute>> =>
      http.get({ ...options, path: routes.support.dispute(id), schema: disputeResource }),

    /** Withdraws a dispute. Any provisional credit is reversed. */
    withdrawDispute: (id: string, options?: MutationOptions): Promise<Resource<Dispute>> =>
      http.delete({ ...options, path: routes.support.dispute(id), schema: disputeResource }),

    /** Attaches evidence to an open dispute. */
    addEvidence: (
      id: string,
      body: AddDisputeEvidenceRequest,
      options?: MutationOptions,
    ): Promise<Resource<Dispute>> =>
      http.post({
        ...options,
        path: routes.support.disputeEvidence(id),
        body,
        schema: disputeResource,
      }),

    /** Reports fraud. Freezes cards by default — the safe answer under uncertainty. */
    reportFraud: (
      body: CreateFraudReportRequest,
      options?: MutationOptions,
    ): Promise<Resource<FraudReport>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.support.fraudReports,
        body,
        schema: fraudReportResource,
      }),

    /** Fraud reports the customer has filed. */
    listFraudReports: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<FraudReport>> =>
      http.get({
        ...options,
        path: routes.support.fraudReports,
        query,
        schema: paginated(fraudReportSchema),
      }),
  };
}

/** The `client.support` group. */
export type SupportResource = ReturnType<typeof createSupportResource>;
