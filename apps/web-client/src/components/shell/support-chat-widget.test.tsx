/**
 * @jest-environment ./src/test/jsdom-fetch-environment
 */

// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * The widget's contract with the customer:
 *
 * - opening the panel shows the most recent conversation, fetched over REST;
 * - a frame down the stream appears in the thread without a refetch;
 * - sending goes out over REST and lands in the same thread;
 * - a closed conversation says so and offers a way to start again.
 *
 * The REST side is served by the real mock API (`@reliance/mocks`); the socket is a fake,
 * because MSW cannot hold a WebSocket open and a test that opened a real one would be
 * testing the network, not the widget.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { ChatAuthorType, ChatConversationStatus, type ChatStreamEvent } from '@reliance/contracts';
import { resetMockDatabase } from '@reliance/mocks';
import { db, server } from '@reliance/mocks/server';

import { setupUser } from '../../test/user';

import { SupportChatWidget } from './support-chat-widget';

const OPENING_MESSAGE = 'Hi — could someone take a look at this for me, please?';
const AGENT_REPLY = 'Of course — give me a moment while I open your account.';

/** A `ChatStreamSocket` the test drives by hand. */
class FakeSocket {
  static readonly instances: FakeSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  open(): void {
    this.onopen?.();
  }

  receive(frame: ChatStreamEvent): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  close(): void {
    this.onclose?.();
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockDatabase(1234);
  FakeSocket.instances.length = 0;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mount(): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SupportChatWidget createSocket={(url) => new FakeSocket(url)} />
    </QueryClientProvider>
  );
}

/** Waits for the hook to mint a token and dial, then completes the handshake. */
async function connectedSocket(): Promise<FakeSocket> {
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
  const socket = FakeSocket.instances[0] as FakeSocket;
  expect(socket.url).toContain('/v1/chat/stream?token=');
  await act(async () => {
    socket.open();
  });
  return socket;
}

async function openPanel(): Promise<void> {
  const user = setupUser();
  await user.click(screen.getByRole('button', { name: /support chat/i }));
  await screen.findByText(OPENING_MESSAGE);
}

describe('SupportChatWidget', () => {
  it('opens the panel on the most recent conversation', async () => {
    render(mount());
    await connectedSocket();

    await openPanel();

    expect(screen.queryByText(AGENT_REPLY)).not.toBeNull();
    expect(screen.queryByLabelText('Message', { selector: 'textarea' })).not.toBeNull();
  });

  it('shows the unread count on the button', async () => {
    render(mount());

    // The seeded conversation has one message the customer has not seen.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /support chat, 1 unread/i })).toBeTruthy(),
    );
    expect(screen.queryByText('1')).not.toBeNull();
  });

  it('appends a streamed message to the open thread without a refetch', async () => {
    render(mount());
    const socket = await connectedSocket();
    await openPanel();

    const conversationId = (db().chatConversations[0] as { id: string }).id;
    const body = 'All sorted — is there anything else I can help with?';
    const frame: ChatStreamEvent = {
      event: 'chat.message',
      data: {
        conversationId,
        message: {
          id: 'cmsg_01ARZ3NDEKTSV4RRFFQ69G5FAV',
          authorType: ChatAuthorType.AGENT,
          authorName: 'Priya',
          body,
          sentAt: '2026-08-17T12:00:00.000Z',
        },
      },
    };

    await act(async () => {
      socket.receive(frame);
    });

    // React Query notifies its observers on its own schedule, so the append lands a tick
    // after the frame is delivered.
    await screen.findByText(body);
  });

  it('sends over REST and shows the message in the thread', async () => {
    const user = setupUser();
    render(mount());
    await connectedSocket();
    await openPanel();

    await user.type(
      screen.getByLabelText('Message', { selector: 'textarea' }),
      'Could you check my last card payment?',
    );
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('Could you check my last card payment?');
  });

  it('says so when the conversation is closed, and offers a new chat', async () => {
    const seeded = db().chatConversations[0] as {
      status: string;
      closedAt: string | null;
    };
    Object.assign(seeded, {
      status: ChatConversationStatus.CLOSED,
      closedAt: '2026-08-17T11:00:00.000Z',
    });

    render(mount());
    await connectedSocket();
    await openPanel();

    expect(screen.queryByText('This conversation is closed')).not.toBeNull();
    expect(screen.getByRole('button', { name: /start a new chat/i })).toBeTruthy();
    expect(screen.queryByLabelText('Message', { selector: 'textarea' })).toBeNull();
  });
});
