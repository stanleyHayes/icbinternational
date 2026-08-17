/**
 * @jest-environment ./src/test/jsdom-fetch-environment
 */
/// <reference types="jest" />

/**
 * The live-chat inbox, end to end: the list and thread over MSW, live frames over a fake
 * socket.
 *
 * MSW cannot hold a WebSocket, so the socket factory is injected — the fake records every
 * connection the hook makes and lets the test push frames down exactly as the server
 * would. REST traffic goes through the real typed client against the stateful mock
 * database, which is what proves the wiring rather than the fixture.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';

import { db, mockId, resetMockDatabase } from '@reliance/mocks';
import { server } from '@reliance/mocks/server';

import { ApiClientProvider } from '@/lib/api-client';
import { setupUser } from '@/test/user';

import { ChatInbox } from './chat-inbox';
import type { ChatSocketFactory, ChatSocketLike } from './use-chat-stream';

/** A scripted WebSocket: open it, push frames down it, drop it. */
class FakeSocket implements ChatSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {}

  close(): void {
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const sockets: FakeSocket[] = [];

const createSocket: ChatSocketFactory = (url) => {
  const socket = new FakeSocket(url);
  sockets.push(socket);
  return socket;
};

function latestSocket(): FakeSocket {
  const socket = sockets.at(-1);
  if (!socket) throw new Error('Expected the inbox to have opened a socket');
  return socket;
}

/** Waits for the token mint and the connection attempt that follows it. */
async function connectedSocket(): Promise<FakeSocket> {
  await waitFor(() => {
    if (sockets.length === 0) throw new Error('No socket yet');
  });
  return latestSocket();
}

function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider onSessionEnded={() => {}}>{children}</ApiClientProvider>
    </QueryClientProvider>
  );
}

function renderInbox() {
  return render(
    <Wrapper>
      <ChatInbox createSocket={createSocket} />
    </Wrapper>,
  );
}

/** The seeded guest conversation — the one started from the marketing site. */
function guestConversation() {
  const conversation = db().chatConversations.find((candidate) => candidate.guest !== null);
  if (!conversation) throw new Error('Expected a seeded guest conversation');
  return conversation;
}

/** Opens a conversation from the list and waits for its thread to render. */
async function openConversation(name: string): Promise<void> {
  const user = setupUser();
  const row = await screen.findByText(name);
  const button = row.closest('button');
  if (!button) throw new Error(`Expected a conversation row for ${name}`);
  await user.click(button);
  await screen.findByText('Hi — could someone take a look at this for me, please?');
}

describe('ChatInbox', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

  beforeEach(() => {
    resetMockDatabase();
    sockets.length = 0;
  });

  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders the seeded conversations, guest included', async () => {
    renderInbox();

    // The guest row shows the visitor's own name; the account holder's row says Customer.
    expect(await screen.findByText('Alex Morgan')).toBeTruthy();
    expect(screen.getAllByText('Customer').length).toBeGreaterThan(0);

    // The inbox connected to the stream with a minted token.
    const socket = await connectedSocket();
    expect(socket.url).toContain('token=');
  });

  it('appends a message that arrives over the stream to the open thread', async () => {
    renderInbox();
    await openConversation('Alex Morgan');
    const socket = await connectedSocket();

    const frame = {
      event: 'chat.message',
      data: {
        conversationId: guestConversation().id,
        message: {
          id: mockId('cmsg'),
          authorType: 'GUEST',
          authorName: 'Alex Morgan',
          body: 'Actually, one more thing — can I add a joint holder later?',
          sentAt: new Date().toISOString(),
        },
      },
    };

    act(() => {
      socket.open();
      socket.receive(frame);
    });

    expect(
      await screen.findByText('Actually, one more thing — can I add a joint holder later?'),
    ).toBeTruthy();
  });

  it('sends a reply over REST and shows it in the thread', async () => {
    const user = setupUser();
    renderInbox();
    await openConversation('Alex Morgan');

    await user.type(screen.getByLabelText(/your reply/i), 'Looking into this for you now.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Looking into this for you now.')).toBeTruthy();

    // The mock database really recorded it — the round trip, not just the cache write.
    const stored = guestConversation();
    expect(stored.messages.at(-1)?.authorType).toBe('AGENT');
    expect(stored.messages.at(-1)?.body).toBe('Looking into this for you now.');
  });

  it('closes a conversation through the confirmation dialog', async () => {
    const user = setupUser();
    renderInbox();
    await openConversation('Alex Morgan');

    await user.click(screen.getByRole('button', { name: 'Close conversation' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close conversation' }));

    expect(await screen.findByText(/this conversation is closed/i)).toBeTruthy();
    expect(db().chatConversations.find((c) => c.id === guestConversation().id)?.status).toBe(
      'CLOSED',
    );
  });
});
