/**
 * Notification, support and business handlers.
 */

import {
  DisputeStatus,
  ErrorCode,
  MANDATORY_CATEGORIES,
  routes,
  TicketStatus,
  type ChannelPreference,
  type Dispute,
  type Ticket,
} from '@reliance/contracts';

import { minorUnits } from '../db/money.js';
import { makeDispute, makeTicket } from '../factories/engagement.js';
import { mockId, opaqueId } from '../faker.js';

import {
  acknowledged,
  failure,
  MockMethod,
  notFound,
  raw,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate } from './paging.js';

const DISPUTE_WINDOW_DAYS = 120;
const SLA_DAYS = 1;

/** Notifications. */
export const notificationHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.notifications.list, ({ db, query }) => {
    const category = query.get('category');
    const unreadOnly = query.get('unreadOnly') === 'true';
    return paginate(
      db.notifications.filter(
        (notification) =>
          (!category || notification.category === category) && (!unreadOnly || !notification.read),
      ),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.POST, routes.notifications.markRead, ({ body, db }) => {
    const ids =
      typeof body === 'object' && body !== null && Array.isArray((body as { ids?: unknown }).ids)
        ? ((body as { ids: unknown[] }).ids as string[])
        : [];

    db.notifications = db.notifications.map((notification) =>
      ids.length === 0 || ids.includes(notification.id)
        ? { ...notification, read: true, readAt: db.clock.nowIso() }
        : notification,
    );
    return acknowledged();
  }),

  route(MockMethod.GET, routes.notifications.preferences, ({ db }) =>
    resourceOk(db.notificationPreferences),
  ),

  route(MockMethod.PUT, routes.notifications.preferences, ({ body, db }) => {
    const submitted = (body ?? {}) as Partial<typeof db.notificationPreferences>;
    const preferences = (submitted.preferences ?? db.notificationPreferences.preferences).map(
      (preference: ChannelPreference) =>
        // Security notifications are re-enabled rather than rejected, matching the API:
        // a customer who mutes them gets a silently corrected preference, not an error.
        MANDATORY_CATEGORIES.includes(preference.category)
          ? { ...preference, inApp: true, email: true, sms: true, push: true }
          : preference,
    );

    db.notificationPreferences = { ...db.notificationPreferences, ...submitted, preferences };
    return resourceOk(db.notificationPreferences);
  }),

  /**
   * The live stream.
   *
   * A single heartbeat frame rather than an open connection: MSW cannot hold a
   * server-sent-events socket open usefully, and a UI that gets one well-formed frame can
   * still prove its parser and its reconnect logic.
   */
  route(MockMethod.GET, routes.notifications.stream, ({ db }) =>
    raw(`event: heartbeat\ndata: ${JSON.stringify({ at: db.clock.nowIso() })}\n\n`, 200),
  ),

  route(MockMethod.POST, routes.notifications.pushSubscribe, () => acknowledged()),
];

/** Tickets, disputes and fraud reports. */
export const supportHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.support.tickets, ({ db, query }) => {
    const status = query.get('status');
    const topic = query.get('topic');
    return paginate(
      db.tickets.filter(
        (ticket) => (!status || ticket.status === status) && (!topic || ticket.topic === topic),
      ),
      query,
    );
  }),

  route(MockMethod.POST, routes.support.tickets, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const ticket = makeTicket({
      clock: db.clock,
      customerName: `${db.currentUser.firstName} ${db.currentUser.lastName}`,
      overrides: {
        id: mockId('tkt'),
        subject: typeof input.subject === 'string' ? input.subject : 'New enquiry',
        topic: (input.topic as Ticket['topic']) ?? 'OTHER',
        status: TicketStatus.OPEN,
        assignedAgentName: null,
        unreadCount: 0,
        slaDueAt: db.clock.daysAhead(SLA_DAYS),
        createdAt: db.clock.nowIso(),
        updatedAt: db.clock.nowIso(),
        messages: [
          {
            id: opaqueId(),
            authorType: 'CUSTOMER',
            authorName: `${db.currentUser.firstName} ${db.currentUser.lastName}`,
            body: typeof input.body === 'string' ? input.body : 'Please help.',
            attachmentIds: [],
            sentAt: db.clock.nowIso(),
          },
        ],
      },
    });

    db.tickets.unshift(ticket);
    return resourceCreated(ticket);
  }),

  route(MockMethod.POST, routes.support.ticketMessages(':id'), ({ body, db, params }) => {
    const index = db.tickets.findIndex((candidate) => candidate.id === params.id);
    const ticket = db.tickets[index];
    if (index === -1 || !ticket) return notFound('That ticket');

    const input = (body ?? {}) as Record<string, unknown>;
    const updated: Ticket = {
      ...ticket,
      status: TicketStatus.AWAITING_AGENT,
      updatedAt: db.clock.nowIso(),
      messages: [
        ...ticket.messages,
        {
          id: opaqueId(),
          authorType: 'CUSTOMER',
          authorName: `${db.currentUser.firstName} ${db.currentUser.lastName}`,
          body: typeof input.body === 'string' ? input.body : '',
          attachmentIds: [],
          sentAt: db.clock.nowIso(),
        },
      ],
    };
    db.tickets[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.support.ticket(':id'), ({ db, params }) => {
    const ticket = db.tickets.find((candidate) => candidate.id === params.id);
    return ticket ? resourceOk(ticket) : notFound('That ticket');
  }),

  route(MockMethod.PATCH, routes.support.ticket(':id'), ({ body, db, params }) => {
    const index = db.tickets.findIndex((candidate) => candidate.id === params.id);
    const ticket = db.tickets[index];
    if (index === -1 || !ticket) return notFound('That ticket');

    const updated: Ticket = {
      ...ticket,
      ...(body as Partial<Ticket>),
      updatedAt: db.clock.nowIso(),
    };
    db.tickets[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.support.disputes, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.disputes.filter((dispute) => !status || dispute.status === status),
      query,
    );
  }),

  route(MockMethod.POST, routes.support.disputes, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const transactionId = String(input.transactionId ?? '');
    const transaction = db.transactions.find((candidate) => candidate.id === transactionId);
    if (!transaction) return notFound('That transaction');

    if (db.disputes.some((dispute) => dispute.transactionId === transactionId)) {
      return failure(
        ErrorCode.DISPUTE_ALREADY_RAISED,
        'There is already an open dispute on this transaction.',
      );
    }

    const bookedDaysAgo =
      (db.clock.nowMs() - Date.parse(transaction.bookedAt)) / (24 * 60 * 60 * 1000);
    if (bookedDaysAgo > DISPUTE_WINDOW_DAYS) {
      return failure(
        ErrorCode.DISPUTE_WINDOW_CLOSED,
        'This transaction is too old to dispute. Contact support instead.',
      );
    }

    const dispute = makeDispute({
      clock: db.clock,
      transactionId,
      amountMinor: minorUnits(transaction.amount),
      overrides: {
        id: mockId('dsp'),
        status: DisputeStatus.SUBMITTED,
        reason: (input.reason as Dispute['reason']) ?? 'OTHER',
        description: typeof input.description === 'string' ? input.description : '',
        provisionalCredit: null,
        provisionalCreditAt: null,
        createdAt: db.clock.nowIso(),
        timeline: [
          { status: DisputeStatus.SUBMITTED, at: db.clock.nowIso(), detail: 'Dispute raised' },
        ],
      },
    });

    db.disputes.unshift(dispute);
    db.transactions = db.transactions.map((candidate) =>
      candidate.id === transactionId ? { ...candidate, disputeId: dispute.id } : candidate,
    );
    return resourceCreated(dispute);
  }),

  route(MockMethod.POST, routes.support.disputeEvidence(':id'), ({ body, db, params }) => {
    const index = db.disputes.findIndex((candidate) => candidate.id === params.id);
    const dispute = db.disputes[index];
    if (index === -1 || !dispute) return notFound('That dispute');

    const input = (body ?? {}) as Record<string, unknown>;
    const evidenceIds = Array.isArray(input.evidenceIds) ? (input.evidenceIds as string[]) : [];
    const updated: Dispute = {
      ...dispute,
      evidenceIds: [...dispute.evidenceIds, ...evidenceIds],
    };
    db.disputes[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.support.dispute(':id'), ({ db, params }) => {
    const dispute = db.disputes.find((candidate) => candidate.id === params.id);
    return dispute ? resourceOk(dispute) : notFound('That dispute');
  }),

  route(MockMethod.DELETE, routes.support.dispute(':id'), ({ db, params }) => {
    const index = db.disputes.findIndex((candidate) => candidate.id === params.id);
    const dispute = db.disputes[index];
    if (index === -1 || !dispute) return notFound('That dispute');

    const withdrawn: Dispute = {
      ...dispute,
      status: DisputeStatus.WITHDRAWN,
      resolvedAt: db.clock.nowIso(),
    };
    db.disputes[index] = withdrawn;
    return resourceOk(withdrawn);
  }),

  route(MockMethod.GET, routes.support.fraudReports, ({ db, query }) =>
    paginate(db.fraudReports, query),
  ),

  route(MockMethod.POST, routes.support.fraudReports, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const freezeCards = input.freezeCards !== false;

    if (freezeCards) {
      db.cards = db.cards.map((card) => ({ ...card, status: 'FROZEN' as const }));
    }

    const report = {
      id: opaqueId(),
      reference: `FR-${opaqueId().slice(0, 8).toUpperCase()}`,
      frozenCardIds: freezeCards ? db.cards.map((card) => card.id) : [],
      frozenAccountIds: input.freezeAccounts === true ? db.accounts.map((a) => a.id) : [],
      ticketId: db.tickets[0]?.id ?? null,
      createdAt: db.clock.nowIso(),
    };

    db.fraudReports.unshift(report);
    return resourceCreated(report);
  }),
];
