import { ErrorCode, TicketPriority, TicketStatus, TicketTopic } from '@reliance/contracts';

import { toContractTicket } from '../ticket.mapper.js';

import {
  AGENT_NAME,
  CUSTOMER,
  CUSTOMER_NAME,
  openTicket,
  STRANGER,
  ticketsRig,
  type TicketsRig,
} from './tickets-harness.js';

const REPLY = 'I have refunded the duplicate collection and it will show within two working days.';

describe('opening a conversation', () => {
  it('sets the priority from the topic and commits to a reply time', async () => {
    const rig = ticketsRig();

    const fraud = await openTicket(rig, { topic: TicketTopic.FRAUD });
    const routine = await openTicket(rig, { topic: TicketTopic.ACCOUNT });

    expect(fraud.priority).toBe(TicketPriority.URGENT);
    expect(routine.priority).toBe(TicketPriority.NORMAL);
    expect(fraud.slaDueAt?.getTime()).toBeLessThan(routine.slaDueAt?.getTime() ?? 0);
  });

  it('signs the opening message with the customer and tells them the deadline', async () => {
    const rig = ticketsRig();

    const ticket = await openTicket(rig);

    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]).toMatchObject({ authorType: 'CUSTOMER', authorName: CUSTOMER_NAME });
    expect(rig.sent.received).toHaveLength(1);
    expect(rig.sent.received[0]?.reference).toBe(ticket.id);
  });

  it('shows the queue one unread message and the customer none', async () => {
    const rig = ticketsRig();

    const ticket = await openTicket(rig);

    expect(toContractTicket(ticket, 'AGENT').unreadCount).toBe(1);
    expect(toContractTicket(ticket, 'CUSTOMER').unreadCount).toBe(0);
  });
});

describe('another customer', () => {
  it('cannot read a conversation that is not theirs, and cannot tell it exists', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);

    await expect(rig.queries.getForCustomer(STRANGER, ticket.id)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    await expect(rig.queries.getForCustomer(STRANGER, 'tkt_nope')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('cannot write to it either', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);

    await expect(
      rig.conversation.postMessage({
        userId: STRANGER,
        ticketId: ticket.id,
        request: { body: 'Let me in', attachmentIds: [] },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});

describe('an agent answering', () => {
  it('hands the conversation back to the customer and drops the deadline', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);

    const answered = await reply(rig, ticket.id);

    expect(answered.status).toBe(TicketStatus.AWAITING_CUSTOMER);
    expect(answered.slaDueAt).toBeNull();
    expect(answered.messages.at(-1)).toMatchObject({ authorType: 'AGENT', authorName: AGENT_NAME });
  });

  it('sends one notification, not two, when it answers and closes in one action', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);

    const closed = await rig.agents.update({
      ticketId: ticket.id,
      agentName: AGENT_NAME,
      request: { reply: REPLY, status: TicketStatus.RESOLVED, attachmentIds: [] },
    });

    expect(closed.resolvedAt).not.toBeNull();
    expect(rig.sent.resolved).toHaveLength(1);
    expect(rig.sent.replied).toHaveLength(0);
    expect(rig.sent.resolved[0]?.outcome).toContain('refunded the duplicate collection');
  });

  it('says nothing to the customer when it only changes hands', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);

    const taken = await rig.agents.update({
      ticketId: ticket.id,
      agentName: AGENT_NAME,
      request: { assignedAgentName: AGENT_NAME, attachmentIds: [] },
    });

    expect(taken.assignedAgentName).toBe(AGENT_NAME);
    expect(rig.sent.replied).toHaveLength(0);
    expect(rig.sent.resolved).toHaveLength(0);
  });

  it('gives a ticket back to the queue when the assignment is cleared', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);
    await rig.agents.update({
      ticketId: ticket.id,
      agentName: AGENT_NAME,
      request: { assignedAgentName: AGENT_NAME, attachmentIds: [] },
    });

    const released = await rig.agents.update({
      ticketId: ticket.id,
      agentName: AGENT_NAME,
      request: { assignedAgentName: '', attachmentIds: [] },
    });

    expect(released.assignedAgentName).toBeNull();
  });
});

describe('a customer writing back', () => {
  it('reopens a settled conversation, as the closing email promised', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);
    await rig.agents.update({
      ticketId: ticket.id,
      agentName: AGENT_NAME,
      request: { status: TicketStatus.RESOLVED, attachmentIds: [] },
    });

    const reopened = await rig.conversation.postMessage({
      userId: CUSTOMER,
      ticketId: ticket.id,
      request: { body: 'It has happened again this morning.', attachmentIds: [] },
    });

    expect(reopened.status).toBe(TicketStatus.AWAITING_AGENT);
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.slaDueAt).not.toBeNull();
  });

  it('does not raise an unread badge over their own words', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);
    await reply(rig, ticket.id);

    const answered = await rig.conversation.postMessage({
      userId: CUSTOMER,
      ticketId: ticket.id,
      request: { body: 'Thank you, that has arrived.', attachmentIds: [] },
    });

    expect(toContractTicket(answered, 'CUSTOMER').unreadCount).toBe(0);
    expect(toContractTicket(answered, 'AGENT').unreadCount).toBe(1);
  });
});

describe('a customer closing the conversation', () => {
  it('records the rating, and refuses to let it be revised', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);

    const closed = await rig.conversation.close({
      userId: CUSTOMER,
      ticketId: ticket.id,
      request: { status: TicketStatus.CLOSED, satisfactionRating: 5 },
    });
    expect(closed.satisfactionRating).toBe(5);

    await expect(
      rig.conversation.close({
        userId: CUSTOMER,
        ticketId: ticket.id,
        request: { status: TicketStatus.CLOSED, satisfactionRating: 1 },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });

  it('treats a second close with nothing new as the double tap it is', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);
    const first = await rig.conversation.close({
      userId: CUSTOMER,
      ticketId: ticket.id,
      request: { status: TicketStatus.CLOSED },
    });

    const second = await rig.conversation.close({
      userId: CUSTOMER,
      ticketId: ticket.id,
      request: { status: TicketStatus.CLOSED },
    });

    expect(second.resolvedAt).toEqual(first.resolvedAt);
    expect(second.status).toBe(TicketStatus.CLOSED);
  });
});

describe('reading a conversation', () => {
  it('clears the reader’s unread count without resurfacing the ticket', async () => {
    const rig = ticketsRig();
    const ticket = await openTicket(rig);
    const answered = await reply(rig, ticket.id);
    expect(toContractTicket(answered, 'CUSTOMER').unreadCount).toBe(1);

    const opened = await rig.queries.getForCustomer(CUSTOMER, ticket.id);

    expect(toContractTicket(opened, 'CUSTOMER').unreadCount).toBe(0);
    expect(opened.updatedAt).toEqual(answered.updatedAt);
  });
});

async function reply(rig: TicketsRig, ticketId: string) {
  return rig.agents.update({
    ticketId,
    agentName: AGENT_NAME,
    request: { reply: REPLY, attachmentIds: [] },
  });
}
