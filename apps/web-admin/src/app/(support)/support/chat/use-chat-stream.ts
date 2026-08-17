/**
 * The agent's live channel, and what happens when there isn't one.
 *
 * Chat events arrive over a single receive-only WebSocket, authorised by a short-lived
 * token minted just before connecting. Corporate proxies terminate long connections, and
 * the connection also dies whenever the operator's laptop sleeps, so a feed that only
 * knows how to stream is a feed that silently stops. This reports which transport is
 * actually carrying events, and the inbox polls whenever it is not streaming — the same
 * contract `useEventStream` makes for the notification feed.
 *
 * Reconnecting refetches the lane. Anything pushed while the socket was down is lost —
 * the socket has no backlog — so a reconnect that did not refetch would show the agent a
 * world that never happened.
 */

'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { ApiClient } from '@reliance/api-client';
import { createApiClient, noCookieReader } from '@reliance/api-client';
import { chatStreamEventSchema, type ChatStreamEvent } from '@reliance/contracts';

import type { FeedTransport } from '@/components/ops/use-event-stream';
import { useApiClient } from '@/lib/api-client';
import { API_ORIGIN } from '@/lib/env';

import { appendThreadMessage, chatKeys, noteInboxMessage, upsertInboxSummary } from './use-chat';

/**
 * The stream address is built against the API origin directly, not the BFF: a WebSocket
 * cannot pass through a Next route handler, so the socket goes straight to the platform,
 * authorised by the short-lived token rather than the session cookie.
 */
const streamClient = createApiClient({ baseUrl: API_ORIGIN, cookieReader: noCookieReader });

/** The slice of the WebSocket the stream needs. The native socket satisfies it. */
export interface ChatSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close: () => void;
}

/** Builds the socket for a minted URL. Injectable so tests can push frames by hand. */
export type ChatSocketFactory = (url: string) => ChatSocketLike;

/**
 * The default socket. `streamUrl` yields a relative path for same-origin proxies, and the
 * `WebSocket` constructor insists on an absolute URL, so it is resolved against the page.
 */
function nativeSocket(url: string): ChatSocketLike {
  const resolved = url.startsWith('ws')
    ? url
    : new URL(url, window.location.href).toString().replace(/^http/, 'ws');
  // The interface is the slice the stream uses; the full event-target typing is wider.
  return new WebSocket(resolved) as ChatSocketLike;
}

/** First retry after a drop; doubles from here up to the ceiling. */
const RETRY_BASE_MS = 1_000;
/** The longest the stream will wait between reconnect attempts. */
const RETRY_MAX_MS = 30_000;

function retryDelayMs(failures: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** failures, RETRY_MAX_MS);
}

/** One frame, validated. Anything that is not a well-formed event is not our business. */
function parseFrame(raw: unknown): ChatStreamEvent | null {
  try {
    const frame = chatStreamEventSchema.safeParse(JSON.parse(String(raw)));
    return frame.success ? frame.data : null;
  } catch {
    return null;
  }
}

/** Writes one validated frame into the inbox and thread caches. */
function applyStreamEvent(queryClient: QueryClient, event: ChatStreamEvent): void {
  if (event.event === 'chat.conversation') {
    upsertInboxSummary(queryClient, event.data);
    return;
  }
  if (event.event === 'chat.message') {
    appendThreadMessage(queryClient, event.data.conversationId, event.data.message);
    noteInboxMessage(queryClient, event.data.conversationId, event.data.message);
  }
  // A heartbeat carries nothing to render; its arrival is the connection's business.
}

interface ConnectOptions {
  readonly client: ApiClient;
  readonly factory: ChatSocketFactory;
  readonly queryClient: QueryClient;
  readonly isCancelled: () => boolean;
  readonly onOpen: () => void;
  readonly onFailure: () => void;
}

/** Mints the token and opens the socket. Resolves to nothing when cancelled mid-mint. */
async function connect(options: ConnectOptions): Promise<ChatSocketLike | undefined> {
  let url: string;
  try {
    const token = await options.client.admin.chatWsToken();
    if (options.isCancelled()) return undefined;
    url = streamClient.chat.streamUrl(token.data.token);
  } catch {
    options.onFailure();
    return undefined;
  }

  const socket = options.factory(url);
  socket.onopen = options.onOpen;
  socket.onmessage = (event) => {
    const frame = parseFrame(event.data);
    if (frame) applyStreamEvent(options.queryClient, frame);
  };
  socket.onerror = () => socket.close();
  socket.onclose = options.onFailure;
  return socket;
}

interface WatchOptions {
  readonly client: ApiClient;
  readonly factory: ChatSocketFactory;
  readonly queryClient: QueryClient;
  /** Failures in a row, feeding the backoff delay. */
  readonly failures: RefObject<number>;
  /** Set when a connection drops, so the next open knows it has a gap to heal. */
  readonly missedEvents: RefObject<boolean>;
  readonly scheduleReconnect: () => void;
  readonly onTransport: (transport: FeedTransport) => void;
}

/** A successful (re)connection: the transport is live, and any missed window refetches. */
function handleOpen(options: WatchOptions): void {
  const { failures, missedEvents, onTransport, queryClient } = options;
  failures.current = 0;
  onTransport('stream');
  if (!missedEvents.current) return;
  missedEvents.current = false;
  void queryClient.invalidateQueries({ queryKey: chatKeys.all });
}

/**
 * One connect/await-retry cycle. Returns the teardown.
 *
 * `onFailure` is named and hoisted rather than written inline in the `setTimeout`, for
 * the same reason as in `useEventStream`: inline, the state updater sits four callbacks
 * deep, which is past the point where the reader can see which scope owns what.
 */
function watchChatStream(options: WatchOptions): () => void {
  if (typeof WebSocket === 'undefined') return () => undefined;

  const { failures, missedEvents, onTransport, scheduleReconnect } = options;
  let cancelled = false;
  let socket: ChatSocketLike | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const onFailure = (): void => {
    if (cancelled) return;
    missedEvents.current = true;
    onTransport('polling');
    retry = setTimeout(scheduleReconnect, retryDelayMs(failures.current));
    failures.current += 1;
  };

  void connect({
    ...options,
    isCancelled: () => cancelled,
    onOpen: () => handleOpen(options),
    onFailure,
  }).then((opened) => {
    if (cancelled) opened?.close();
    else socket = opened;
  });

  return () => {
    cancelled = true;
    if (retry) clearTimeout(retry);
    if (socket) {
      // Tearing down for unmount or re-attempt must not read as a dropped connection.
      socket.onclose = null;
      socket.close();
    }
  };
}

/** How long to wait before trying the stream again after a failure, counting up. */
export function useChatStream(factory: ChatSocketFactory = nativeSocket): FeedTransport {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [transport, setTransport] = useState<FeedTransport>('polling');
  const [attempt, setAttempt] = useState(0);

  // Both refs rather than state: the failure count feeds the backoff delay and the
  // missed-events flag gates the resync, and neither is anything to render.
  const failures = useRef(0);
  const missedEvents = useRef(false);

  const scheduleReconnect = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(
    () =>
      watchChatStream({
        client,
        factory,
        queryClient,
        failures,
        missedEvents,
        scheduleReconnect,
        onTransport: setTransport,
      }),
    [client, factory, queryClient, attempt, scheduleReconnect],
  );

  return transport;
}
