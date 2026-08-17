// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * The guest chat widget, end to end: pre-chat form over MSW, live frames over a fake socket.
 *
 * MSW cannot hold a WebSocket, so the socket factory is injected — the fake records every
 * connection the hook makes and lets the test push frames down exactly as the server would.
 * REST traffic goes through the real typed client against the stateful mock database, which
 * is what proves the wiring rather than the fixture.
 */

import { act, render, screen, waitFor } from '@testing-library/react';

import { mockId, resetMockDatabase } from '@reliance/mocks';
import { server } from '@reliance/mocks/server';

import { type ChatSocket } from '@/lib/chat/use-guest-chat';

import { setupUser } from '../../test/user';

import { ChatWidget } from './chat-widget';

// The hook builds its client lazily, so setting the variable before the first render is
// enough. An absolute origin keeps Node's fetch happy; the mock handlers match any origin.
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4400/v1';

/** A scripted WebSocket: open it, push frames down it, drop it. */
class FakeSocket implements ChatSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(): void {}
  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const sockets: FakeSocket[] = [];

function createSocket(url: string): ChatSocket {
  const socket = new FakeSocket(url);
  sockets.push(socket);
  return socket;
}

function latestSocket(): FakeSocket {
  const socket = sockets.at(-1);
  if (!socket) throw new Error('Expected the widget to have opened a socket');
  return socket;
}

/**
 * The stream effect is a passive effect, flushed by the scheduler rather than synchronously
 * with the click that started the conversation — so the socket exists one macrotask later.
 */
function awaitSocket(): Promise<FakeSocket> {
  return waitFor(() => latestSocket());
}

/** The session the hook persisted after starting a conversation. */
function storedConversationId(): string {
  const raw = window.sessionStorage.getItem('rb-guest-chat');
  if (raw === null) throw new Error('Expected a stored guest chat session');
  return (JSON.parse(raw) as { conversationId: string }).conversationId;
}

/** Opens the panel and starts a conversation through the pre-chat form. */
async function startConversation(): Promise<void> {
  const user = setupUser();
  await user.click(screen.getByRole('button', { name: 'Chat with us' }));
  await user.type(screen.getByLabelText(/your name/i), 'Ada Lovelace');
  await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/how can we help/i), 'Do you offer joint accounts?');
  await user.click(screen.getByRole('button', { name: 'Start chat' }));
  await screen.findByText('Do you offer joint accounts?');
}

function agentFrame(conversationId: string, body: string) {
  return {
    event: 'chat.message',
    data: {
      conversationId,
      message: {
        id: mockId('cmsg'),
        authorType: 'AGENT',
        authorName: 'Sam at Reliance',
        body,
        sentAt: new Date().toISOString(),
      },
    },
  };
}

describe('ChatWidget', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

  beforeEach(() => {
    resetMockDatabase();
    window.sessionStorage.clear();
    sockets.length = 0;
  });

  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('starts a conversation from the pre-chat form and shows the thread', async () => {
    render(<ChatWidget createSocket={createSocket} />);

    await startConversation();

    // The opening message is in the thread, and the stream connected with the guest token.
    expect(screen.getByRole('list', { name: 'Conversation' })).toBeTruthy();
    expect((await awaitSocket()).url).toContain('token=');
  });

  it('appends a message that arrives over the stream', async () => {
    render(<ChatWidget createSocket={createSocket} />);
    await startConversation();
    const socket = await awaitSocket();

    act(() => {
      socket.receive(agentFrame(storedConversationId(), 'Yes — both of you can apply together.'));
    });

    expect(await screen.findByText('Yes — both of you can apply together.')).toBeTruthy();
  });

  it('drops a frame that does not conform to the stream contract', async () => {
    render(<ChatWidget createSocket={createSocket} />);
    await startConversation();
    const socket = await awaitSocket();

    act(() => {
      socket.receive({ event: 'chat.message', data: { conversationId: 'not-an-id' } });
    });

    // Nothing rendered, nothing threw: the thread is unchanged.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('shows the closed notice and starts a fresh chat', async () => {
    const user = setupUser();
    render(<ChatWidget createSocket={createSocket} />);
    await startConversation();
    const socket = await awaitSocket();

    const conversationId = storedConversationId();
    const now = new Date().toISOString();
    act(() => {
      socket.receive({
        event: 'chat.conversation',
        data: {
          id: conversationId,
          status: 'CLOSED',
          subject: 'Website enquiry',
          createdAt: now,
          updatedAt: now,
          closedAt: now,
          customerUserId: null,
          guest: { name: 'Ada Lovelace', email: 'ada@example.com' },
          assignedAgentName: null,
          agentUnreadCount: 0,
        },
      });
    });

    expect(await screen.findByText('This conversation has ended')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Start a new chat' }));

    // Back to the pre-chat form, with the old session forgotten.
    expect(screen.getByLabelText(/how can we help/i)).toBeTruthy();
    expect(window.sessionStorage.getItem('rb-guest-chat')).toBeNull();
  });

  it('counts messages that arrive while the panel is closed, and clears on open', async () => {
    const user = setupUser();
    render(<ChatWidget createSocket={createSocket} />);
    await startConversation();
    const socket = await awaitSocket();

    await user.click(screen.getByRole('button', { name: 'Close chat' }));

    act(() => {
      socket.receive(agentFrame(storedConversationId(), 'Thanks for your message.'));
      socket.receive(agentFrame(storedConversationId(), 'We will reply shortly.'));
    });

    expect(await screen.findByLabelText('2 unread messages')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Chat with us' }));

    expect(screen.queryByLabelText('2 unread messages')).toBeNull();
  });
});
