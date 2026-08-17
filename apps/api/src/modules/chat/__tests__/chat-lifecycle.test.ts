import { ChatConversationStatus, ErrorCode } from '@reliance/contracts';

import { toAdminConversation, toContractConversation } from '../chat.mapper.js';

import {
  agentPrincipal,
  chatRig,
  CUSTOMER,
  CUSTOMER_NAME,
  GUEST_EMAIL,
  GUEST_NAME,
  STRANGER,
  type ChatRig,
} from './chat-harness.js';

const OPENING = 'My card was declined at the till and I do not understand why.';
const REPLY = 'The merchant sent a malformed authorisation. Your card is fine — please retry.';

async function openGuestConversation(rig: ChatRig) {
  return rig.chat.createGuestConversation({ name: GUEST_NAME, email: GUEST_EMAIL, body: OPENING });
}

async function openCustomerConversation(rig: ChatRig, userId = CUSTOMER) {
  return rig.chat.createConversation(userId, {
    subject: 'Card declined at the till',
    body: OPENING,
  });
}

describe('a guest conversation', () => {
  it('opens with the guest’s words as the first message and one agent-unread', async () => {
    const rig = chatRig();

    const conversation = await openGuestConversation(rig);

    expect(conversation.id).toMatch(/^cnv_/);
    expect(conversation.status).toBe(ChatConversationStatus.OPEN);
    expect(conversation.customerUserId).toBeNull();
    expect(conversation.guest).toEqual({ name: GUEST_NAME, email: GUEST_EMAIL });
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({ authorType: 'GUEST', authorName: GUEST_NAME });
    expect(conversation.agentUnreadCount).toBe(1);
    expect(conversation.unreadCount).toBe(0);
  });

  it('runs the full cycle: guest writes, agent answers, agent closes', async () => {
    const rig = chatRig();
    const opened = await openGuestConversation(rig);

    await rig.chat.postGuestMessage(opened.id, 'It happened again this morning.');
    const answered = await rig.adminChat.postAgentMessage(agentPrincipal(), opened.id, REPLY);

    expect(answered.messages.at(-1)).toMatchObject({
      authorType: 'AGENT',
      authorName: expect.any(String),
    });
    expect(answered.assignedAgentName).not.toBeNull();
    expect(answered.unreadCount).toBe(1);

    const closed = await rig.adminChat.closeConversation(opened.id);

    expect(closed.status).toBe(ChatConversationStatus.CLOSED);
    expect(closed.closedAt).not.toBeNull();
    expect(closed.messages.at(-1)).toMatchObject({ authorType: 'SYSTEM' });
  });

  it('clears the guest’s badge when they open the thread, without resurfacing it', async () => {
    const rig = chatRig();
    const opened = await openGuestConversation(rig);
    const answered = await rig.adminChat.postAgentMessage(agentPrincipal(), opened.id, REPLY);
    expect(answered.unreadCount).toBe(1);

    const read = await rig.chat.getGuestConversation(opened.id);

    expect(read.unreadCount).toBe(0);
    expect(read.updatedAt).toEqual(answered.updatedAt);
  });

  it('refuses to continue a closed conversation', async () => {
    const rig = chatRig();
    const opened = await openGuestConversation(rig);
    await rig.adminChat.closeConversation(opened.id);

    await expect(
      rig.chat.postGuestMessage(opened.id, 'Are you still there?'),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });
});

describe('a customer conversation', () => {
  it('opens signed with the name the bank knows the customer by', async () => {
    const rig = chatRig();

    const conversation = await openCustomerConversation(rig);

    expect(conversation.customerUserId).toBe(CUSTOMER);
    expect(conversation.messages[0]).toMatchObject({
      authorType: 'CUSTOMER',
      authorName: CUSTOMER_NAME,
    });
    expect(conversation.agentUnreadCount).toBe(1);
  });

  it('lists only the customer’s own conversations, most recently active first', async () => {
    const rig = chatRig();
    const first = await openCustomerConversation(rig);
    rig.clock.advance(60_000);
    const second = await rig.chat.createConversation(CUSTOMER, {
      subject: 'A second question',
      body: 'And another thing.',
    });
    await openCustomerConversation(rig, STRANGER);

    const page = await rig.chat.listConversations(CUSTOMER, { limit: 10 });

    expect(page.data.map((conversation) => conversation.id)).toEqual([second.id, first.id]);
  });

  it('cannot be read or written by another customer, and cannot be told apart from missing', async () => {
    const rig = chatRig();
    const conversation = await openCustomerConversation(rig);

    await expect(rig.chat.getConversation(STRANGER, conversation.id)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    await expect(
      rig.chat.postMessage(STRANGER, conversation.id, 'Let me in'),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    await expect(rig.chat.closeConversation(STRANGER, conversation.id)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('rejects posts once closed, whether by the customer or the bank', async () => {
    const rig = chatRig();
    const conversation = await openCustomerConversation(rig);

    const closed = await rig.chat.closeConversation(CUSTOMER, conversation.id);
    expect(closed.status).toBe(ChatConversationStatus.CLOSED);

    await expect(
      rig.chat.postMessage(CUSTOMER, conversation.id, 'One more thing'),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    await expect(
      rig.adminChat.postAgentMessage(agentPrincipal(), conversation.id, REPLY),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });

  it('treats a second close as the double tap it is', async () => {
    const rig = chatRig();
    const conversation = await openCustomerConversation(rig);
    const first = await rig.chat.closeConversation(CUSTOMER, conversation.id);

    const second = await rig.chat.closeConversation(CUSTOMER, conversation.id);

    expect(second.closedAt).toEqual(first.closedAt);
    expect(second.messages).toHaveLength(first.messages.length);
  });
});

describe('the agent inbox', () => {
  it('orders by last activity and filters by status', async () => {
    const rig = chatRig();
    const stale = await openGuestConversation(rig);
    await rig.adminChat.closeConversation(stale.id);
    rig.clock.advance(60_000);
    const fresh = await openCustomerConversation(rig);

    const open = await rig.adminChat.listConversations({
      status: ChatConversationStatus.OPEN,
      limit: 10,
    });
    const everything = await rig.adminChat.listConversations({ limit: 10 });

    expect(open.data.map((conversation) => conversation.id)).toEqual([fresh.id]);
    expect(everything.data[0]?.id).toBe(fresh.id);
  });

  it('opening a conversation clears the agent-side badge', async () => {
    const rig = chatRig();
    const opened = await openGuestConversation(rig);
    expect(toAdminConversation(opened).agentUnreadCount).toBe(1);

    const read = await rig.adminChat.getConversation(opened.id);

    expect(read.agentUnreadCount).toBe(0);
  });

  it('assigns the first agent to answer, and does not change hands afterwards', async () => {
    const rig = chatRig();
    const opened = await openGuestConversation(rig);
    const first = await rig.adminChat.postAgentMessage(agentPrincipal(), opened.id, REPLY);

    const second = await rig.adminChat.postAgentMessage(
      { ...agentPrincipal(), fullName: 'Marcus Bell' },
      opened.id,
      'Following up on my colleague’s reply.',
    );

    expect(first.assignedAgentName).not.toBeNull();
    expect(second.assignedAgentName).toBe(first.assignedAgentName);
    expect(second.messages.at(-1)?.authorName).toBe('Marcus Bell');
  });

  it('closing an already-closed conversation adds no second closing line', async () => {
    const rig = chatRig();
    const opened = await openGuestConversation(rig);
    const first = await rig.adminChat.closeConversation(opened.id);

    const second = await rig.adminChat.closeConversation(opened.id);

    expect(second.messages).toHaveLength(first.messages.length);
    expect(second.closedAt).toEqual(first.closedAt);
  });

  it('maps to the contract shapes on both sides of the glass', async () => {
    const rig = chatRig();
    const opened = await openCustomerConversation(rig);
    const answered = await rig.adminChat.postAgentMessage(agentPrincipal(), opened.id, REPLY);

    const participantView = toContractConversation(answered);
    const adminView = toAdminConversation(answered);

    expect(participantView).not.toHaveProperty('customerUserId');
    expect(participantView).not.toHaveProperty('agentUnreadCount');
    expect(participantView.unreadCount).toBe(1);
    expect(adminView.customerUserId).toBe(CUSTOMER);
    expect(adminView.messages.at(-1)?.authorType).toBe('AGENT');
  });
});
