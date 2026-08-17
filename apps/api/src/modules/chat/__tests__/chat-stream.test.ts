import { ErrorCode } from '@reliance/contracts';

import { toWireMessage } from '../chat.mapper.js';

import { AGENT_ID, chatRig, connect, CUSTOMER, STRANGER } from './chat-harness.js';

describe('the chat stream', () => {
  it('delivers a message to the participant and every agent, and to nobody else', async () => {
    const rig = chatRig();
    const customerSocket = connect(rig, { kind: 'customer', userId: CUSTOMER, sessionId: 'ses_1' });
    const strangerSocket = connect(rig, { kind: 'customer', userId: STRANGER, sessionId: 'ses_2' });
    const agentSocket = connect(rig, { kind: 'agent', adminId: AGENT_ID });
    const secondAgentSocket = connect(rig, { kind: 'agent', adminId: 'adm_other' });

    await rig.chat.createConversation(CUSTOMER, {
      subject: 'Card declined',
      body: 'It was declined again.',
    });

    for (const socket of [customerSocket, agentSocket, secondAgentSocket]) {
      const events = socket.events();
      expect(events.some((frame) => frame.event === 'chat.message')).toBe(true);
      expect(events.some((frame) => frame.event === 'chat.conversation')).toBe(true);
    }
    expect(strangerSocket.frames).toHaveLength(0);
  });

  it('delivers a guest conversation to its guest scope and the agents only', async () => {
    const rig = chatRig();
    const otherGuest = connect(rig, { kind: 'guest', conversationId: 'cnv_elsewhere' });
    const agentSocket = connect(rig, { kind: 'agent', adminId: AGENT_ID });

    const conversation = await rig.chat.createGuestConversation({
      name: 'Owen Tate',
      email: 'owen.tate@example.com',
      body: 'Do you open on Saturdays?',
    });
    const guestSocket = connect(rig, { kind: 'guest', conversationId: conversation.id });

    await rig.chat.postGuestMessage(conversation.id, 'The branch on King Street, I mean.');

    expect(guestSocket.events().some((frame) => frame.event === 'chat.message')).toBe(true);
    expect(agentSocket.events().filter((frame) => frame.event === 'chat.message')).toHaveLength(2);
    expect(otherGuest.frames).toHaveLength(0);
  });

  it('frames conform to the contract event union', async () => {
    const rig = chatRig();
    const agentSocket = connect(rig, { kind: 'agent', adminId: AGENT_ID });

    const conversation = await rig.chat.createGuestConversation({
      name: 'Owen Tate',
      email: 'owen.tate@example.com',
      body: 'Hello.',
    });
    const message = conversation.messages[0];
    if (!message) throw new Error('expected an opening message');

    const frame = agentSocket.events().find((event) => event.event === 'chat.message');
    expect(frame).toEqual({
      event: 'chat.message',
      data: { conversationId: conversation.id, message: toWireMessage(message) },
    });
  });

  it('caps connections per principal and frees the slot on unregister', async () => {
    const rig = chatRig();
    const scope = { kind: 'agent' as const, adminId: AGENT_ID };
    const sockets = Array.from({ length: 8 }, () => connect(rig, scope));

    let refused: unknown;
    try {
      rig.stream.register(new ThrowawaySocket(), scope);
    } catch (error) {
      refused = error;
    }
    expect(refused).toMatchObject({ code: ErrorCode.FORBIDDEN });

    const [first] = sockets;
    if (!first) throw new Error('expected a socket');
    rig.stream.unregister(first);

    // The freed slot can be taken again — the cap did not leak.
    expect(() => rig.stream.register(new ThrowawaySocket(), scope)).not.toThrow();
  });

  it('forgets an unregistered socket entirely', async () => {
    const rig = chatRig();
    const agentSocket = connect(rig, { kind: 'agent', adminId: AGENT_ID });
    rig.stream.unregister(agentSocket);

    await rig.chat.createGuestConversation({
      name: 'Owen Tate',
      email: 'owen.tate@example.com',
      body: 'Hello.',
    });

    expect(agentSocket.frames).toHaveLength(0);
    expect(rig.stream.connectionCount).toBe(0);
  });

  it('does not count a second unregister against the cap', () => {
    const rig = chatRig();
    const scope = { kind: 'guest' as const, conversationId: 'cnv_1' };
    const socket = connect(rig, scope);

    rig.stream.unregister(socket);
    rig.stream.unregister(socket);

    expect(rig.stream.connectionCount).toBe(0);
    expect(() => connect(rig, scope)).not.toThrow();
  });
});

/** A socket that must never receive a frame — the tests assert it was refused first. */
class ThrowawaySocket {
  readonly readyState = 1;
  send(): void {
    throw new Error('frame sent to a socket that should have been refused');
  }
  close(): void {}
}
